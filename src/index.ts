import Database, { Database as DatabaseType } from 'better-sqlite3';

/**
 * simple-sqlite-wrapper class for simplified interaction with SQLite databases.
 */
export default class SQLiteWrapper<X> {
    db: DatabaseType;
    name: string;
    autoEnsure: X | null;
    strict: boolean;

    /**
     * Creates an instance of simple-sqlite-wrapper.
     * @param dbPath - The path to the SQLite database file.
     * @param name - The name of the table.
     * @param options - Configuration options.
     */
    constructor(dbPath: string, name: string, options: { autoEnsure?: X; strict?: boolean } | null = null) {
        this.db = new Database(dbPath);
        this.name = name.replace(/[^a-zA-Z0-9_]/g, '');
        this.autoEnsure = Object.freeze(options?.autoEnsure) ?? null;
        this.strict = options?.strict ?? false;

        this.initTable();
    }

    /**
     * Initializes the table in the database if it does not exist.
     */
    initTable(): void {
        this.db.pragma('journal_mode = WAL');
        this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.name} (key TEXT PRIMARY KEY, value TEXT)`).run();
    }

    /**
     * Sets the value for a given key.
     * @param key - The key for which to set the value.
     * @param value - The value to set for the key.
     * @param dir - Optional. A dot-separated path for nested structures.
     * @returns The value the key was set to.
     */
    set<X>(key: string, value: X): X;
    set<T>(key: string, value: T, dir: string): T;
    set<T>(key: string, value: T, dir?: string): T {
        if (!dir) {
            if (this.autoEnsure != null && typeof value !== typeof this.autoEnsure && this.strict) {
                throw new Error('Type of value does not match the type of autoEnsure.');
            }
            this._set(key, value as unknown as X);
            return value;
        } else {
            const before = this.get(key) || this.autoEnsure;
            if (before == null) throw new Error('autoEnsure is not set, and no default value is provided.');

            const keys = dir.split('.');
            const result: Record<string, any> = {};

            let currentLevel = result;
            keys.forEach((key, index) => {
                if (index === keys.length - 1) {
                    Object.assign(currentLevel, { [key]: value });
                } else {
                    // if this branch isnt an object, make it one
                    currentLevel[key] = isObject(currentLevel[key]) ? currentLevel[key] : {};
                    // go down to the next level, now that we know its an object
                    currentLevel = currentLevel[key];
                }
            });
            console.log(before, result);
            console.log(mergeObjects<X>(before, result as X));
            this._set(key, mergeObjects<X>(before, result as X));
            return value;
        }
    }

    /**
     * Gets the value for a given key.
     * @param key - The key for which to retrieve the value.
     * @returns - The value of the desired key.
     */
    get(key: string): X | null;
    /**
     * Gets the value for a given key.
     * @param key - The key for which to retrieve the value.
     * @param dir - Optional. A dot-separated path for nested structures.
     * @returns - The value of the desired key at the sublocation.
     */
    get(key: string, dir: string): any | null;
    get(key: string, dir?: string): X | any | null {
        const result = (this.db.prepare(`SELECT value FROM ${this.name} WHERE key = ?`).get(key) as { value: string } | null)?.value;

        if (dir && result) {
            const keys = dir.split('.');
            try {
                let currentObj = JSON.parse(result);

                for (const key of keys) {
                    if (currentObj.hasOwnProperty(key)) {
                        currentObj = currentObj[key];
                    } else {
                        return null;
                    }
                }

                let returnable: any = null;
                if (currentObj) returnable = parseDynamic(currentObj);
                if (typeof currentObj === 'object' || Array.isArray(currentObj)) returnable = currentObj;
                return returnable;
            } catch (error) {
                throw new Error('Failed to parse JSON from database.');
            }
        }
        return result ? (parseDynamic(result) as X) : null;
    }

    /**
     * Deletes a key from the database.
     * @param key - The key to delete.
     */
    delete(key: string): void {
        this.db.prepare(`DELETE FROM ${this.name} WHERE key = ?`).run(key);
    }

    /**
     * Ensures a key with a default value if it doesn't exist.
     * @param key - The key to ensure.
     * @returns - The current value of the key.
     */
    ensure(key: string): X {
        const existingValue = this.get(key);

        if (existingValue === null) {
            if (this.autoEnsure !== null) return this._set(key, this.autoEnsure);
            else throw new Error('autoEnsure is not set, and no default value is provided.');
        } else {
            if (this.autoEnsure !== null) return this._set(key, mergeObjects<X>(this.autoEnsure, existingValue));
            else return existingValue;
        }
    }

    /**
     * Pushes a value into an array associated with a key.
     * @param key - The key for the array.
     * @param value - The value to push into the array.
     * @param dir - Optional. A dot-separated path for nested structures.
     */
    push<T>(key: string, value: T, dir?: string): T[] {
        const c = (dir ? this.get(key, dir) : this.get(key) || []) as T[];

        if (!Array.isArray(c)) {
            throw new Error('The value at the specified key and path is not an array.');
        }

        c.push(value);
        if (dir) {
            this.set(key, c, dir);
        } else {
            this.set(key, c as X);
        }
        return c;
    }

    /**
     * Gets all entries in the database.
     */
    getAll(): Record<string, X> {
        const results = this.db.prepare(`SELECT * FROM ${this.name}`).all() as Array<{ key: string; value: string }>;
        return results.reduce((acc: Record<string, X>, row) => {
            acc[row.key] = JSON.parse(row.value) as X;
            return acc;
        }, {});
    }

    /**
     * Whether or not this key exists in the database
     */
    has(key: string): boolean {
        const result = this.db.prepare(`SELECT 1 FROM ${this.name} WHERE key = ?`).get(key);
        return result !== undefined;
    }

    /**
     * Internal method to set a value in the database.
     * @param key - The key to set.
     * @param value - The value to set.
     */
    private _set(key: string, value: X): X {
        if (typeof key !== 'string') throw new Error('Key must be a string');
        try {
            const stmt = this.db.prepare(`INSERT OR REPLACE INTO ${this.name} (key, value) VALUES (?, ?)`);
            const serializedValue = value === null ? JSON.stringify(null) : JSON.stringify(value);
            stmt.run(key, serializedValue);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error('Failed to execute database operation: ' + error.message);
            } else {
                throw new Error('An unknown error occurred during database operation.');
            }
        }
        return value;
    }

    /**
     * Filters the entries based on a filter function.
     * @param filterFunction - The filter function.
     */
    filter(filterFunction: (value: X, key: string) => boolean): Record<string, X> {
        const allEntries = this.getAll();
        const filteredEntries = Object.entries(allEntries).filter(([key, value]) => filterFunction(value, key));
        return Object.fromEntries(filteredEntries);
    }

    /**
     * Finds the key based on a filter function.
     * @param filterFunction - The filter function.
     */
    findKey(filterFunction: (value: X, key: string) => boolean): string | null {
        const filtered = this.filter(filterFunction);
        return Object.keys(filtered)?.[0] || null;
    }

    /**
     * Finds the value based on a filter function.
     * @param filterFunction - The filter function.
     */
    find(filterFunction: (value: X, key: string) => boolean): X | null {
        const filtered = this.filter(filterFunction);
        return Object.values(filtered)?.[0] || null;
    }

    /**
     * Increments a value by a specified amount.
     * @param key - The key to increment.
     * @param dir - Optional. A dot-separated path for nested structures.
     */
    inc(key: string, dir?: string): number {
        const currentValue = (dir ? this.get(key, dir) : (this.get(key) as number | null)) || 0;
        const newValue = currentValue + 1;
        dir ? this.set(key, newValue, dir) : this.set(key, newValue);
        return newValue;
    }

    /**
     * Decrements a value by a specified amount.
     * @param key - The key to decrement.
     * @param dir - Optional. A dot-separated path for nested structures.
     */
    dec(key: string, dir?: string): number {
        const currentValue = (dir ? this.get(key, dir) : (this.get(key) as number | null)) || 0;
        const newValue = currentValue - 1;
        dir ? this.set(key, newValue) : this.set(key, newValue);
        return newValue;
    }

    /**
     * Performs a mathematical operation on a value.
     * @param key - The key to perform the operation on.
     * @param operation - The mathematical operation to perform.
     * @param value - The value to use in the operation.
     * @param dir - Optional. A dot-separated path for nested structures.
     */
    math(key: string, operation: '+' | '-' | '*' | '/' | '%' | '^', value: number, dir?: string): number {
        const currentValue = (dir ? this.get(key, dir) : (this.get(key) as number | null)) || 0;
        if (currentValue == null) {
            throw new Error(`Key "${key}" does not exist.`);
        }
        const newValue = performMathOperation(currentValue, operation, value);
        dir ? this.set(key, newValue, dir) : this.set(key, newValue);
        return newValue;
    }

    /**
     * Selects a random value from the database.
     */
    random(): X | null {
        const allEntries = this.getAll();
        const keys = Object.keys(allEntries);
        if (keys.length === 0) return null;
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        return allEntries[randomKey];
    }

    /**
     * Returns an array of all keys in the database.
     */
    keyArray(): string[] {
        const allEntries = this.getAll();
        return Object.keys(allEntries);
    }

    /**
     * Returns the number of entries in the database.
     */
    length(): number {
        const allEntries = this.getAll();
        return Object.keys(allEntries).length;
    }

    /**
     * Generate a unique pseudo-random key stirng
     */
    autonum(): string {
        let str = '',
            attempts = 0;
        while (attempts++ < 100 && this.has((str = Math.random().toString(36).substring(2, 10))));
        return str;
    }
}

function performMathOperation(value1: number, operation: '+' | '-' | '*' | '/' | '%' | '^', value2: number): number {
    switch (operation) {
        case '+':
            return value1 + value2;
        case '-':
            return value1 - value2;
        case '*':
            return value1 * value2;
        case '/':
            if (value2 === 0) throw new Error('Division by zero is not allowed.');
            return value1 / value2;
        case '%':
            if (value2 === 0) throw new Error('Modulo by zero is not allowed.');
            return value1 % value2;
        case '^':
            return Math.pow(value1, value2);
    }
}

function parseDynamic(value: any): number | string | object | null {
    try {
        const parsedJSON = JSON.parse(value);
        return parsedJSON;
    } catch (error) {}
    const parsedNumber = parseFloat(value);
    if (!isNaN(parsedNumber)) return parsedNumber;
    return value;
}

function mergeObjects<X>(o: X, ...objects: Partial<X>[]): X {
    let out = o;
    for (const obj of objects) {
        out = mergeRecursive(out, obj);
    }
    return out;
}
function mergeRecursive<Y>(old: Y, newValues: Partial<Y>): Y {
    for (const key in newValues) {
        if (newValues[key]) {
            if (isObject(newValues[key]) && isObject(old[key])) {
                // if old and new are both objects, merge them recursively
                old[key] = mergeRecursive(old[key] as Y[Extract<keyof Y, string>], newValues[key]);
            } else {
                // otherwise, just assign the new value
                old = { ...old, [key]: newValues[key] };
            }
        }
    }
    return old;
}
function isObject(obj: any): boolean {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}
