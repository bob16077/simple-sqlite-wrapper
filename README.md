# SQLiteWrapper

SQLiteWrapper is a lightweight wrapper around the [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) library, providing a simple and efficient interface for working with SQLite databases in Node.js.

## Installation

```bash
npm install better-sqlite3 sqlite-wrapper
```

## Usage

```javascript
const SQLiteWrapper = require('sqlite-wrapper');

// Create an instance of SQLiteWrapper
const dbPath = './my-database.db';
const tableName = 'my_table';
const options = { autoEnsure: { key: 'defaultValue' } };
const sqliteWrapper = new SQLiteWrapper(dbPath, tableName, options);

// Set a key-value pair
await sqliteWrapper.set('myKey', 'myValue');

// Get the value for a key
const value = await sqliteWrapper.get('myKey');
console.log(value); // Output: 'myValue'

// Perform mathematical operations on numeric values
await sqliteWrapper.math('numericKey', '+', 5);

// Check if a key exists
const keyExists = await sqliteWrapper.has('existingKey');
console.log(keyExists); // Output: true
```

## Features

- **Simplified API:** Easily perform common database operations with a straightforward API.
- **Automatic Table Initialization:** Automatically creates the specified table if it does not exist.
- **Math Operations:** Perform mathematical operations on numeric values stored in the database.
- **Default Values:** Set default values for keys to be automatically ensured if not present.
- **Object Merging:** Support for merging objects, useful for updating nested structures.

## Methods

### `set(key, value, dir)`

Sets the value for a given key.

- `key`: The key for which to set the value.
- `value`: The value to set for the key.
- `dir`: Optional. A dot-separated path for nested structures.

### `get(key, dir)`

Gets the value for a given key.

- `key`: The key for which to retrieve the value.
- `dir`: Optional. A dot-separated path for nested structures.

### `math(key, operation, operand, path)`

Performs a mathematical operation on the value associated with a key.

- `key`: The key for which to perform the mathematical operation.
- `operation`: The mathematical operation to perform (`+`, `-`, `*`, `/`, `%`, `^`).
- `operand`: The operand for the mathematical operation.
- `path`: Optional. A dot-separated path for nested structures.

### `has(key)`

Checks if a key exists in the database.

- `key`: The key to check for existence.

### `autonum()`

Generates a unique alphanumeric code.

### ... and more!

Refer to the source code for a comprehensive list of methods and their descriptions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
