# simple-sqlite-wrapper: API and Architecture Guide

This guide documents how the wrapper is set up, how values are stored, and how every public method behaves.

## 1. Setup and Initialization

### Install

```bash
npm install simple-sqlite-wrapper
```

### Basic usage

```ts
import SQLiteWrapper from 'simple-sqlite-wrapper';

type UserRecord = {
    profile: { name: string; score: number };
    flags: { active: boolean };
};

const users = new SQLiteWrapper<UserRecord>('app.db', 'users', {
    autoEnsure: {
        profile: { name: 'unknown', score: 0 },
        flags: { active: true }
    },
    strict: false
});
```

### What the constructor does

`new SQLiteWrapper(dbPath, name, options)`

- Opens a Better SQLite3 connection to `dbPath`.
- Sanitizes `name` to only letters, numbers, and `_`.
- Throws if the sanitized table name becomes empty.
- Stores `autoEnsure` (frozen for safety when it is an object).
- Stores `strict` mode.
- Calls `initTable()`.

### Table structure

Each wrapper instance uses one SQLite table:

```sql
CREATE TABLE IF NOT EXISTS <name> (
  key TEXT PRIMARY KEY,
  value TEXT
)
```

- `key` is the record id.
- `value` is a JSON string.

## 2. Data Model and Merge Behavior

### Storage format

- All values are serialized with `JSON.stringify`.
- Reads parse JSON dynamically and return JS values.

### Nested updates

Methods that accept `dir` (dot path) merge partial updates into the existing record.

Example:

```ts
users.set('u1', 'Ada', 'profile.name');
```

### Ensure behavior

`ensure` merges the template into existing data without mutating the original template.

- Missing key: template is cloned and inserted.
- Existing key: template clone is deep-merged with existing value.

## 3. Public API Reference

## Constructor

### `new SQLiteWrapper<X>(dbPath: string, name: string, options?: { autoEnsure?: X; strict?: boolean } | null)`

Creates a wrapper bound to one table.

## Core CRUD

### `set<T>(key: string, value: T): T`

### `set<T>(key: string, value: T, dir: string): T`

Sets a full value or a nested path.

- Top-level call writes `value` directly.
- Nested call writes into `dir` and merges into the row object.

### `get(key: string): X | null`

### `get(key: string, dir: string): any | null`

Gets a full row or a nested path.

- Returns `null` for missing keys/paths.
- Throws if malformed JSON is encountered while path-reading.

### `delete(key: string): void`

Deletes one row by key.

### `has(key: string): boolean`

Returns true when the key exists.

## Ensure APIs

### `ensure(key: string): X`

### `ensure(key: string, defaultValue: X): X`

Ensures the row exists.

- Uses `defaultValue` when provided.
- Otherwise uses `autoEnsure`.
- Throws if neither template exists.

### `ensureDeep(key: string, partialTemplate: DeepPartial<X>, baseTemplate: X): X`

Builds a full template by deep-merging `partialTemplate` over `baseTemplate`, then ensures.

Useful when defaults are mostly stable but partially overridden at call-time.

## Typed Path APIs

These APIs provide compile-time path/value checks for nested data.

### `getPath<P extends Path<X>>(key: string, dir: P): PathValue<X, P> | null`

Typed nested getter.

### `setPath<P extends Path<X>>(key: string, dir: P, value: PathValue<X, P>): PathValue<X, P>`

Typed nested setter.

### `incPath<P extends NumberPath<X>>(key: string, dir: P): number`

### `decPath<P extends NumberPath<X>>(key: string, dir: P): number`

### `mathPath<P extends NumberPath<X>>(key: string, dir: P, operation: '+' | '-' | '*' | '/' | '%' | '^', value: number): number`

Typed numeric nested math helpers.

## Array helpers

### `push<T>(key: string, value: T, dir?: string): T[]`

Pushes into an array at top-level or nested path.

- Throws if target is not an array.

## Numeric helpers

### `inc(key: string, dir?: string): number`

### `dec(key: string, dir?: string): number`

### `math(key: string, operation: '+' | '-' | '*' | '/' | '%' | '^', value: number, dir?: string): number`

Performs arithmetic on top-level or nested numeric values.

- Division/modulo by zero throws.

## Query helpers

### `getAll(): Record<string, X>`

Returns all rows as an object map.

- Throws if any row contains malformed JSON.

### `getAllSafe(): { entries: Record<string, X>; invalidKeys: string[] }`

Safe variant that skips malformed rows.

### `tryGetAll(): { ok: true; value: Record<string, X> } | { ok: false; error: Error }`

Non-throwing wrapper around `getAll`.

### `filter(filterFunction: (value: X, key: string) => boolean): Record<string, X>`

### `findKey(filterFunction: (value: X, key: string) => boolean): string | null`

### `find(filterFunction: (value: X, key: string) => boolean): X | null`

Functional query helpers.

## Utility helpers

### `random(): X | null`

Returns a random row value.

### `keyArray(): string[]`

Returns all keys.

### `length(): number`

Returns number of keys.

### `autonum(): string`

Generates a pseudo-random unique key candidate.

## Safe non-throwing math

### `tryMath(key: string, operation: '+' | '-' | '*' | '/' | '%' | '^', value: number, dir?: string): { ok: true; value: number } | { ok: false; error: Error }`

Non-throwing wrapper around `math`.

## 4. How the Wrapper Works Internally

1. SQLite connection opens in constructor.
2. `initTable()` enables WAL journal mode and ensures table exists.
3. Writes use parameterized statements (`INSERT OR REPLACE`).
4. Reads parse JSON and optionally traverse nested paths.
5. Nested writes build a patch object and deep-merge into existing row.
6. Template merges are non-mutating to avoid side effects.

## 5. Strict Mode Notes

When `strict: true`:

- `set` top-level checks `typeof value` against `typeof autoEnsure`.
- This is a runtime basic check (`typeof`), not deep structural validation.

## 6. Error Behavior Summary

Common throws:

- Invalid sanitized table name in constructor.
- Type mismatch in strict mode top-level `set`.
- Malformed JSON for path reads.
- Missing templates in `ensure`.
- Array operation on non-array targets.
- Division/modulo by zero.
- Database write/statement errors.

Use `getAllSafe`, `tryGetAll`, and `tryMath` when you prefer result-style error handling.

## 7. Practical Patterns

### Pattern: ensure then nested update

```ts
users.ensure('u1');
users.setPath('u1', 'profile.name', 'Ada');
users.incPath('u1', 'profile.score');
```

### Pattern: safe bulk read in production paths

```ts
const all = users.getAllSafe();
if (all.invalidKeys.length > 0) {
    console.warn('Invalid rows skipped:', all.invalidKeys);
}
```

### Pattern: non-throwing arithmetic

```ts
const r = users.tryMath('u1', '/', 0, 'profile.score');
if (!r.ok) {
    console.error(r.error.message);
}
```

## 8. Versioning Guidance

If you publish this package:

- Treat removal or behavior change of current methods as major-version changes.
- Additive typed helpers like those above are safe minor-version features.
