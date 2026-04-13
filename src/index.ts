import Database, { Database as DatabaseType } from 'better-sqlite3';

type Primitive = string | number | boolean | bigint | symbol | null | undefined | Date;
type Prev = [never, 0, 1, 2, 3, 4, 5];

type Path<T, D extends number = 5> = [D] extends [never]
    ? never
    : T extends Primitive
      ? never
      : {
            [K in keyof T & string]: T[K] extends Primitive
                ? K
                : K | `${K}.${Path<T[K], Prev[D]>}`;
        }[keyof T & string];

type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
        ? PathValue<T[K], Rest>
        : never
    : P extends keyof T
      ? T[P]
      : never;

type NumberPath<T> = {
    [P in Path<T>]: PathValue<T, P> extends number ? P : never;
}[Path<T>];

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type SafeResult<T> = { ok: true; value: T } | { ok: false; error: Error };

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
        if (!this.name) {
            throw new Error('Table name must include at least one alphanumeric or underscore character.');
        }

        const autoEnsure = options?.autoEnsure;
        if (autoEnsure === undefined) {
            this.autoEnsure = null;
        } else if (typeof autoEnsure === 'object' && autoEnsure !== null) {
            this.autoEnsure = Object.freeze(autoEnsure) as X;
        } else {
            this.autoEnsure = autoEnsure;
        }
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
    set<T>(key: string, value: T): T;
    set<T>(key: string, value: T, dir: string): T;
    set<T>(key: string, value: T, dir?: string): T {
        if (!dir) {
            if (this.autoEnsure != null && typeof value !== typeof this.autoEnsure && this.strict) {
                throw new Error('Type of value does not match the type of autoEnsure.');
            }
            this._set(key, value as unknown as X);
            return value;
        } else {
            const before = this.get(key) || (this.autoEnsure !== null ? cloneValue(this.autoEnsure) : ({} as X));

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
                    if (currentObj !== null && (typeof currentObj === 'object' || Array.isArray(currentObj)) && Object.prototype.hasOwnProperty.call(currentObj, key)) {
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
     * Typed path getter. This is additive and delegates to get(key, dir).
     */
    getPath<P extends Path<X>>(key: string, dir: P): PathValue<X, P> | null {
        return this.get(key, dir as string) as PathValue<X, P> | null;
    }

    /**
     * Typed path setter. This is additive and delegates to set(key, value, dir).
     */
    setPath<P extends Path<X>>(key: string, dir: P, value: PathValue<X, P>): PathValue<X, P> {
        return this.set(key, value, dir as string) as PathValue<X, P>;
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
    ensure(key: string): X;

    /**
     * Ensures a key with a provided default value when autoEnsure is not configured.
     * @param key - The key to ensure.
     * @param defaultValue - A fallback template used for this ensure call.
     * @returns - The current value of the key.
     */
    ensure(key: string, defaultValue: X): X;
    ensure(key: string, defaultValue?: X): X {
        const existingValue = this.get(key);
        const template = defaultValue !== undefined ? defaultValue : this.autoEnsure;

        if (existingValue === null) {
            if (template !== null && template !== undefined) return this._set(key, cloneValue(template));
            else throw new Error('autoEnsure is not set, and no default value is provided.');
        } else {
            if (template !== null && template !== undefined) return this._set(key, mergeObjects<X>(cloneValue(template), existingValue));
            else return existingValue;
        }
    }

    /**
     * Ensures a key using a deep-partial template merged onto a required base shape.
     * This keeps typing strict while supporting partial defaults.
     */
    ensureDeep(key: string, partialTemplate: DeepPartial<X>, baseTemplate: X): X {
        const fullTemplate = mergeObjects<X>(cloneValue(baseTemplate), partialTemplate as Partial<X>);
        return this.ensure(key, fullTemplate);
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
            acc[row.key] = parseStoredValue<X>(row.value, row.key);
            return acc;
        }, {});
    }

    /**
     * Safely gets all entries and skips malformed rows instead of throwing.
     * @returns Parsed entries and the list of skipped keys.
     */
    getAllSafe(): { entries: Record<string, X>; invalidKeys: string[] } {
        const results = this.db.prepare(`SELECT * FROM ${this.name}`).all() as Array<{ key: string; value: string }>;
        return results.reduce(
            (acc, row) => {
                try {
                    acc.entries[row.key] = parseStoredValue<X>(row.value, row.key);
                } catch {
                    acc.invalidKeys.push(row.key);
                }
                return acc;
            },
            { entries: {} as Record<string, X>, invalidKeys: [] as string[] }
        );
    }

    /**
     * Non-throwing variant of getAll.
     */
    tryGetAll(): SafeResult<Record<string, X>> {
        try {
            return { ok: true, value: this.getAll() };
        } catch (error) {
            return { ok: false, error: toError(error) };
        }
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
        dir ? this.set(key, newValue, dir) : this.set<number>(key, newValue);
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
        dir ? this.set(key, newValue, dir) : this.set<number>(key, newValue);
        return newValue;
    }

    /**
     * Typed path increment for numeric nested paths.
     */
    incPath<P extends NumberPath<X>>(key: string, dir: P): number {
        return this.inc(key, dir as string);
    }

    /**
     * Typed path decrement for numeric nested paths.
     */
    decPath<P extends NumberPath<X>>(key: string, dir: P): number {
        return this.dec(key, dir as string);
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
        dir ? this.set(key, newValue, dir) : this.set<number>(key, newValue);
        return newValue;
    }

    /**
     * Typed path math operation for numeric nested paths.
     */
    mathPath<P extends NumberPath<X>>(key: string, dir: P, operation: '+' | '-' | '*' | '/' | '%' | '^', value: number): number {
        return this.math(key, operation, value, dir as string);
    }

    /**
     * Non-throwing variant of math.
     */
    tryMath(key: string, operation: '+' | '-' | '*' | '/' | '%' | '^', value: number, dir?: string): SafeResult<number> {
        try {
            return { ok: true, value: this.math(key, operation, value, dir) };
        } catch (error) {
            return { ok: false, error: toError(error) };
        }
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

function parseStoredValue<T>(value: string, key: string): T {
    try {
        return JSON.parse(value) as T;
    } catch (error) {
        throw new Error(`Failed to parse JSON for key "${key}".`);
    }
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function mergeObjects<X>(o: X, ...objects: Partial<X>[]): X {
    let out = cloneValue(o);
    for (const obj of objects) {
        out = mergeRecursive(out, obj);
    }
    return out;
}
function mergeRecursive<Y>(old: Y, newValues: Partial<Y>): Y {
    const base: Record<string, any> = isObject(old) ? { ...(old as Record<string, any>) } : {};
    const incoming = newValues as Record<string, any>;

    for (const key in incoming) {
        if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
        const nextValue = incoming[key];
        const currentValue = base[key];

        if (isObject(nextValue) && isObject(currentValue)) {
            base[key] = mergeRecursive(currentValue, nextValue);
        } else if (isObject(nextValue)) {
            base[key] = mergeRecursive({}, nextValue);
        } else if (Array.isArray(nextValue)) {
            base[key] = [...nextValue];
        } else {
            base[key] = nextValue;
        }
    }

    return base as Y;
}
function cloneValue<T>(value: T): T {
    if (typeof value !== 'object' || value === null) {
        return value;
    }

    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => cloneValue(item)) as T;
    }

    const cloned: Record<string, any> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, any>)) {
        cloned[key] = cloneValue(nestedValue);
    }
    return cloned as T;
}
function isObject(obj: any): boolean {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}
