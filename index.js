const Database = require('better-sqlite3');

class SQLiteWrapper {
    constructor(dbPath, name, options) {
        this.db = new Database(dbPath);
        this.name = name;
        this.autoEnsure = (options && options.autoEnsure !== undefined) ? options.autoEnsure : null;

        this.initTable();
    };

    async initTable() {
        const stmt = this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.name} (key TEXT PRIMARY KEY, value TEXT)`);
        stmt.run();
    };

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

    async delete(key) {
        const stmt = this.db.prepare(`DELETE FROM ${this.name} WHERE key = ?`);
        stmt.run(key);
    };

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

    async autonum() {
        const code = Buffer.from(`${Math.random()}`).toString('base64').slice(3,12);
        if (await this.has(code)) return await this.autonum();
        else return code;
    };

    async filter(filterFunction) {
        const allEntries = await this.getAll();
        const filteredEntries = Object.entries(allEntries).filter(([key, value]) => filterFunction(value, key));
        return Object.fromEntries(filteredEntries);
    };

    async findKey(filterFunction) {
        const filtered = await this.filter(filterFunction);
        return Object.keys(filtered)?.[0] || null;
    };

    async find(filterFunction) {
        const filtered = await this.filter(filterFunction);
        return Object.values(filtered)?.[0] || null;
    };

    async push(key, value, dir) {
        let c = await this.get(key, dir) || [];
        if (!isNaN(c?.length)) c.push(value);
        await this.set(key, c, dir);
    };

    async getAll() {
        const stmt = this.db.prepare(`SELECT * FROM ${this.name}`);
        const results = stmt.all();
        return results.reduce((acc, row) => {
            acc[row.key] = JSON.parse(row.value);
            return acc;
        }, {});
    };

    async random() {
        const allEntries = await this.getAll();
        if (Object.keys(allEntries).length === 0) return null;
        const randomKey = Object.keys(allEntries)[Math.floor(Math.random() * Object.keys(allEntries).length)];
        return allEntries[randomKey];
    };

    async keyArray() {
        const all = await this.getAll();
        return Object.keys(all);
    };

    async length() {
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.name}`);
        const result = stmt.get();
        return result.count;
    };

    async has(key) {
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.name} WHERE key = ?`);
        const result = stmt.get(key);
        return result.count > 0;
    };

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

    async includes(key, value, path) {
        const v = await this.get(key, path);
        return v.length ? v.includes(value) : false;
    };

    async inc(key, dir) {
        let before = await this.get(key, dir);
        before = Number(before) + 1;
        this.set(key, before, dir);
    };

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