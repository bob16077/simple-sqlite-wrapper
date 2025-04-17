import Database, { Database as DatabaseType } from 'better-sqlite3';

/**
 * simple-sqlite-wrapper class for simplified interaction with SQLite databases.
 */
export default class SQLiteWrapper<X> {
    db: DatabaseType;
    name: string;
    autoEnsure: X | null;

    /**
     * Creates an instance of simple-sqlite-wrapper.
     * @param dbPath - The path to the SQLite database file.
     * @param name - The name of the table.
     * @param options - Configuration options.
     */
    constructor(dbPath: string, name: string, options: { autoEnsure?: X } | null = null) {
        this.db = new Database(dbPath);
        this.name = name;
        this.autoEnsure = options?.autoEnsure ?? null;

        this.initTable();
    }

    /**
     * Initializes the table in the database if it does not exist.
     */
    initTable() {
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
    set<Y>(key: string, value: Y, dir?: string): Y {
        let before = this.get(key, dir as string);
        if (!before) before = this.ensure(key);

        let newValue;
        if (dir && !!this.autoEnsure) {
            const keys = dir.split('.');
            const result: Record<string, any> = {};

            let currentLevel = result;
            keys.forEach((key, index) => {
                if (index === keys.length - 1) {
                    currentLevel[key] = value;
                } else {
                    currentLevel[key] = currentLevel[key] || {};
                    currentLevel = currentLevel[key];
                }
            });
            newValue = mergeObjects<X>(before!, result as X);
        } else {
            newValue = value;
        }
        console.log(before, value, dir, newValue);
        this._set(key, newValue ?? before);
        return value;
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
        let result = (this.db.prepare(`SELECT value FROM ${this.name} WHERE key = ?`).get(key) as any | null)?.value as string;

        if (dir && result) {
            const keys = dir.split('.');
            let currentObj = JSON.parse(result);

            for (const key of keys) {
                if (currentObj.hasOwnProperty(key)) {
                    currentObj = currentObj[key];
                } else {
                    return null;
                }
            }

            let returnable = null;
            if (currentObj) returnable = parseDynamic(currentObj);
            if (typeof currentObj === 'object' || Array.isArray(currentObj)) returnable = currentObj;
            return returnable;
        }
        return result ? (parseDynamic(result) as X) : null;
    }

    /**
     * Deletes a key from the database.
     * @param key - The key to delete.
     */
    delete(key: string) {
        return this.db.prepare(`DELETE FROM ${this.name} WHERE key = ?`).run(key);
    }

    /**
     * Ensures a key with a default value if it doesn't exist.
     * @param key - The key to ensure.
     * @returns - The current value of the key.
     */
    ensure(key: string): X {
        const existingValue = this.get(key);

        if (existingValue === null) {
            if (this.autoEnsure) return this._set(key, this.autoEnsure);
            else return this._set(key, null as X);
        } else {
            let value;
            if (this.autoEnsure) {
                value = mergeObjects<X>(this.autoEnsure, existingValue);
                return this._set(key, value as X);
            }
            return this._set(key, null as X);
        }
    }

    /**
     * Generates a unique alphanumeric code.
     */
    autonum(): string {
        const code = Buffer.from(`${Math.random()}`).toString('base64').slice(3, 12);
        if (this.has(code)) return this.autonum();
        else return code;
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
     * Pushes a value into an array associated with a key.
     * @param key - The key for the array.
     * @param value - The value to push into the array.
     * @param dir - Optional. A dot-separated path for nested structures.
     */
    push<Y>(key: string, value: Y, dir: string): Y[] | void {
        let c = (this.get(key, dir) || []) as Y[];
        if (!Array.isArray(c)) return;

        c.push(value);
        this.set(key, c, dir);
        return c;
    }

    /**
     * Gets all entries in the database.
     */
    getAll(): Record<string, X> {
        const results = this.db.prepare(`SELECT * FROM ${this.name}`).all();
        return results.reduce((acc: Record<string, X>, row: any) => {
            acc[row.key as string] = JSON.parse(row.value as string) as X;
            return acc;
        }, {});
    }

    /**
     * Retrieves a random value from the database.
     */
    random(): X | null {
        const allEntries = this.getAll();
        const randomKey = Object.keys(allEntries)[Math.floor(Math.random() * Object.keys(allEntries).length)];
        return allEntries[randomKey];
    }

    /**
     * Retrieves an array of all keys in the database.
     */
    keyArray(): Array<string> {
        const all = this.getAll();
        return Object.keys(all);
    }

    /**
     * Retrieves the number of entries in the database.
     */
    length(): number {
        const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.name}`).get() as { count: number };
        return result.count;
    }

    /**
     * Checks if a key exists in the database.
     * @param key - The key to check for existence.
     */
    has(key: string): boolean {
        const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.name} WHERE key = ?`).get(key) as { count: number };
        return result.count > 0;
    }

    /**
     * Performs a mathematical operation on the value associated with a key.
     * @param key - The key for which to perform the mathematical operation.
     * @param operation - The mathematical operation to perform (+, -, *, /, %, ^).
     * @param operand - The operand for the mathematical operation.
     * @param path - Optional. A dot-separated path for nested structures.
     */
    math(key: string, operation: '+' | '-' | '*' | '/' | '%' | '^', operand: number, path: string = ''): number | void {
        const currentValue = this.get(key);
        if (typeof currentValue !== 'number') return;

        if (!!currentValue) {
            let newValue;
            if (path) {
                const valueAtPath = this.get(key, path);
                if (!valueAtPath) return;
                newValue = performMathOperation(valueAtPath as X & number, operation, operand);
                return this.set(key, newValue, path);
            } else {
                newValue = performMathOperation(currentValue, operation, operand);
                return this.set(key, newValue);
            }
        } else {
            const defaultValue = performMathOperation(0, operation, operand);
            return this.set(key, defaultValue);
        }
    }

    /**
     * Checks if a value is included in an array associated with a key.
     * @param key - The key for the array.
     * @param value - The value to check for inclusion.
     * @param path - Optional. A dot-separated path for nested structures.
     */
    includes(key: string, value: any, path?: string): boolean {
        const v = this.get(key, path as string);
        if (!Array.isArray(v)) return false;

        return v.length ? v.includes(value) : false;
    }

    /**
     * Increments the value associated with a key.
     * @param key - The key to increment.
     * @param dir - Optional. A dot-separated path for nested structures.
     */
    inc(key: string, dir: string): number | void {
        const before = this.get(key, dir);
        if (typeof before !== 'number') return;
        const incremented = (before + 1) as number;
        this.set(key, incremented, dir);
        return incremented;
    }

    /**
     * Decrements the value associated with a key.
     * @param key - The key to decrement.
     * @param dir - Optional. A dot-separated path for nested structures.
     */
    dec(key: string, dir: string): number | void {
        const before = this.get(key, dir);
        if (typeof before !== 'number') return;
        const decremented = (before - 1) as number;
        this.set(key, decremented, dir);
        return decremented;
    }

    _set(key: string, value: X) {
        if (typeof key !== 'string') throw new Error('Key must be a string');
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO ${this.name} (key, value) VALUES (?, ?)`);
        const serializedValue = value === null ? 'null' : JSON.stringify(value);
        stmt.run(key, serializedValue);
        return value;
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
            if (value2 !== 0) return value1 / value2;
            else throw new Error('Division by zero is not allowed.');
        case '%':
            if (value2 !== 0) return value1 % value2;
            else throw new Error('Modulo by zero is not allowed.');
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
    let merged: X = o;
    for (const obj of objects) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && !Array.isArray(obj[key]))
                    merged[key] = mergeObjects<X[Extract<keyof X, string>]>(merged[key], obj[key] as Partial<X[Extract<keyof X, string>]>);
                else merged[key] = obj[key]!;
            }
        }
    }
    return merged;
}
