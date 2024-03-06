# simple-sqlite-wrapper

**simple-sqlite-wrapper** is a lightweight, syncronous, and easy-to-use wrapper around `better-sqlite3` for simplified interaction with SQLite databases.

## Installation

```bash
npm install simple-sqlite-wrapper
```

## Usage

```javascript
const SQLiteWrapper = require('simple-sqlite-wrapper');

// Create a new instance of SQLiteWrapper
const db = new SQLiteWrapper('path/to/database.db', 'myTable');

// Set a value for a key
db.set('myKey', 'myValue');

// Get the value for a key
const value = db.get('myKey');
console.log(value); // Output: 'myValue'
```

## API Reference

### `new SQLiteWrapper(dbPath, name, options)`

Creates an instance of SQLiteWrapper.

- `dbPath` (string): The path to the SQLite database file.
- `name` (string): The name of the table.
- `options` (Object): Configuration options.

### `set(key, value, dir)`

Sets the value for a given key.

- `key` (string): The key for which to set the value.
- `value` (any): The value to set for the key.
- `dir` (string): Optional. A dot-separated path for nested structures.

Returns the value that has been set.

### `get(key, dir)`

Gets the value for a given key.

- `key` (string): The key for which to retrieve the value.
- `dir` (string): Optional. A dot-separated path for nested structures.

Returns the retrieved value.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
