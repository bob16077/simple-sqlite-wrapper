const Database = require('better-sqlite3');

/**
 * SQLiteWrapper class for simplified interaction with SQLite databases.
 */
class SQLiteWrapper {
    /**
     * Creates an instance of SQLiteWrapper.
     * @param {string} dbPath - The path to the SQLite database file.
     * @param {string} name - The name of the table.
     * @param {Object} options - Configuration options.
     */
    constructor(dbPath, name, options) {
        this.db = new Database(dbPath);
        this.name = name;
        this.autoEnsure = (options && options.autoEnsure !== undefined) ? options.autoEnsure : null;

        this.initTable();
    };

    /**
     * Initializes the table in the database if it does not exist.
     */
    async initTable() {
        const stmt = this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.name} (key TEXT PRIMARY KEY, value TEXT)`);
        stmt.run();
    };

    /**
     * Sets the value for a given key.
     * @param {string} key - The key for which to set the value.
     * @param {any} value - The value to set for the key.
     * @param {string} dir - Optional. A dot-separated path for nested structures.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async set(key, value, dir) {
        let before = await this.get(key);
        if (before == null) before = await this.ensure(key);
        if (dir) {
            const keys = dir.split('.');
            const result = {};

            let currentLevel = result;
            keys.forEach((key, index) => {
                if (index === keys.length - 1) {
                    currentLevel[key] = value;
                } else {
                    currentLevel[key] = currentLevel[key] || {};
                    currentLevel = currentLevel[key];
                }
            });
            value = mergeObjects({}, before, result);
        }
        return this._set(key, value);
    };

    /**
     * Gets the value for a given key.
     * @param {string} key - The key for which to retrieve the value.
     * @param {string} dir - Optional. A dot-separated path for nested structures.
     * @returns {Promise<any>} - A promise that resolves with the retrieved value.
     */
    async get(key, dir) {
        const stmt = this.db.prepare(`SELECT value FROM ${this.name} WHERE key = ?`);
        let result = stmt.get(key);

        if (dir && result) {
            const keys = dir.split('.');
            let currentObj = JSON.parse(result?.value);

            for (const key of keys) {
                if (currentObj.hasOwnProperty(key)) {
                    currentObj = currentObj[key];
                } else {
                    return undefined;
                }
            }

            let returnable = null;
            if (currentObj) returnable = parseDynamic(currentObj);
            if (typeof currentObj === 'object' || Array.isArray(currentObj)) returnable = currentObj;
            return returnable;
        }
        return result ? parseDynamic(result?.value) : null;
    };

    /**
     * Deletes a key from the database.
     * @param {string} key - The key to delete.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async delete(key) {
        const stmt = this.db.prepare(`DELETE FROM ${this.name} WHERE key = ?`);
        stmt.run(key);
    };

    /**
     * Ensures a key with a default value if it doesn't exist.
     * @param {string} key - The key to ensure.
     * @returns {Promise<any>} - A promise that resolves with the ensured value.
     */
    async ensure(key) {
        const existingValue = await this.get(key);

        if (existingValue === null) {
            await this._set(key, this.autoEnsure);
            return this.autoEnsure;
        } else {
            let value = mergeObjects({}, this.autoEnsure, existingValue);
            return this._set(key, value);
        }
    };

    /**
     * Generates a unique alphanumeric code.
     * @returns {Promise<string>} - A promise that resolves with the generated code.
     */
    async autonum() {
        const code = Buffer.from(`${Math.random()}`).toString('base64').slice(3,12);
        if (await this.has(code)) return await this.autonum();
        else return code;
    };
    
    /**
     * Filters the entries based on a filter function.
     * @param {function} filterFunction - The filter function.
     * @returns {Promise<Object>} - A promise that resolves with the filtered entries.
     */
    async filter(filterFunction) {
        const allEntries = await this.getAll();
        const filteredEntries = Object.entries(allEntries).filter(([key, value]) => filterFunction(value, key));
        return Object.fromEntries(filteredEntries);
    };

    /**
     * Finds the key based on a filter function.
     * @param {function} filterFunction - The filter function.
     * @returns {Promise<string|null>} - A promise that resolves with the found key or null.
     */
    async findKey(filterFunction) {
        const filtered = await this.filter(filterFunction);
        return Object.keys(filtered)?.[0] || null;
    };

    /**
     * Finds the value based on a filter function.
     * @param {function} filterFunction - The filter function.
     * @returns {Promise<any|null>} - A promise that resolves with the found value or null.
     */
    async find(filterFunction) {
        const filtered = await this.filter(filterFunction);
        return Object.values(filtered)?.[0] || null;
    };

    /**
     * Pushes a value into an array associated with a key.
     * @param {string} key - The key for the array.
     * @param {any} value - The value to push into the array.
     * @param {string} dir - Optional. A dot-separated path for nested structures.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async push(key, value, dir) {
        let c = await this.get(key, dir) || [];
        if (!isNaN(c?.length)) c.push(value);
        await this.set(key, c, dir);
    };

    /**
     * Gets all entries in the database.
     * @returns {Promise<Object>} - A promise that resolves with all entries.
     */
    async getAll() {
        const stmt = this.db.prepare(`SELECT * FROM ${this.name}`);
        const results = stmt.all();
        return results.reduce((acc, row) => {
            acc[row.key] = JSON.parse(row.value);
            return acc;
        }, {});
    };

    /**
     * Retrieves a random value from the database.
     * @returns {Promise<any|null>} - A promise that resolves with a random value or null if the database is empty.
     */
    async random() {
        const allEntries = await this.getAll();
        if (Object.keys(allEntries).length === 0) return null;
        const randomKey = Object.keys(allEntries)[Math.floor(Math.random() * Object.keys(allEntries).length)];
        return allEntries[randomKey];
    };

    /**
     * Retrieves an array of all keys in the database.
     * @returns {Promise<Array<string>>} - A promise that resolves with an array of keys.
     */
    async keyArray() {
        const all = await this.getAll();
        return Object.keys(all);
    };

    /**
     * Retrieves the number of entries in the database.
     * @returns {Promise<number>} - A promise that resolves with the number of entries.
     */
    async length() {
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.name}`);
        const result = stmt.get();
        return result.count;
    };

    /**
     * Checks if a key exists in the database.
     * @param {string} key - The key to check for existence.
     * @returns {Promise<boolean>} - A promise that resolves with a boolean indicating whether the key exists.
     */
    async has(key) {
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.name} WHERE key = ?`);
        const result = stmt.get(key);
        return result.count > 0;
    };

    /**
     * Performs a mathematical operation on the value associated with a key.
     * @param {string} key - The key for which to perform the mathematical operation.
     * @param {string} operation - The mathematical operation to perform (+, -, *, /, %, ^).
     * @param {number} operand - The operand for the mathematical operation.
     * @param {string} path - Optional. A dot-separated path for nested structures.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async math(key, operation, operand, path = '') {
        const currentValue = await this.get(key);
        if (currentValue !== null) {
            let newValue;
            if (path) {
                const valueAtPath = await this.get(key, path);
                newValue = performMathOperation(valueAtPath, operation, operand);
                await this.set(key, newValue, path);
            } else {
                newValue = performMathOperation(currentValue, operation, operand);
                await this.set(key, newValue);
            }
        } else {
            const defaultValue = performMathOperation(null, operation, operand);
            await this.set(key, defaultValue);
        }
    };

    /**
     * Checks if a value is included in an array associated with a key.
     * @param {string} key - The key for the array.
     * @param {any} value - The value to check for inclusion.
     * @param {string} path - Optional. A dot-separated path for nested structures.
     * @returns {Promise<boolean>} - A promise that resolves with a boolean indicating whether the value is included.
     */
    async includes(key, value, path) {
        const v = await this.get(key, path);
        return v.length ? v.includes(value) : false;
    };

    /**
     * Increments the value associated with a key.
     * @param {string} key - The key to increment.
     * @param {string} dir - Optional. A dot-separated path for nested structures.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async inc(key, dir) {
        let before = await this.get(key, dir);
        before = Number(before) + 1;
        this.set(key, before, dir);
    };

    /**
     * Decrements the value associated with a key.
     * @param {string} key - The key to decrement.
     * @param {string} dir - Optional. A dot-separated path for nested structures.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async dec(key, dir) {
        let before = await this.get(key, dir);
        before = Number(before) - 1;
        this.set(key, before, dir);
    };

    async _ensure(key) {
        return await this._set(key, this.autoEnsure);
    };

    async _set(key, value) {
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO ${this.name} (key, value) VALUES (?, ?)`);
        const serializedValue = (value === null) ? 'null' : JSON.stringify(value);
        stmt.run(key, serializedValue);
        return value;
    };
}

module.exports = SQLiteWrapper;

function performMathOperation(value1, operation, value2) {
    switch (operation) {
        case '+':
            return value1 + value2;
        case '-':
            return value1 - value2;
        case '*':
            return value1 * value2;
        case '/':
            if (value2 !== 0) return value1 / value2;
            else throw new Error("Division by zero is not allowed.");
        case '%':
            if (value2 !== 0) return value1 % value2;
            else throw new Error("Modulo by zero is not allowed.");
        case '^':
            return Math.pow(value1, value2);
        default:
            throw new Error("Invalid operation");
    }
}

function parseDynamic(value) {
    try {
        const parsedJSON = JSON.parse(value);
        return parsedJSON;
    } catch (error) {};
    const parsedNumber = parseFloat(value);
    if (!isNaN(parsedNumber)) return parsedNumber;
    return value;
};

function mergeObjects(...objects) {
    let merged = {};
    for (const obj of objects) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (obj[key] === null || obj[key] === undefined) merged[key] = obj[key];
                else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) merged[key] = mergeObjects(merged[key] || {}, obj[key]);
                else merged[key] = obj[key];
            }
        }
    };
    return merged;
};