/// <reference types="jest" />

import SQLiteWrapper from '../src/index';
import fs from 'fs';
import path from 'path';

describe('SQLiteWrapper Comprehensive Tests', () => {
    const dbPath = path.join(__dirname, 'test.db');

    beforeAll(() => {
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    afterAll(() => {
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    test('set and get with nested structures', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'nested_test', { autoEnsure: {} });
        wrapper.set('key1', 'value1', 'nested.path');
        const value = wrapper.get('key1', 'nested.path');
        expect(value).toBe('value1');

        wrapper.set('key1', null, 'nested.path');
        expect(wrapper.get('key1', 'nested.path')).toBeNull();
    });

    test('constructor rejects table names that sanitize to empty', () => {
        expect(() => new SQLiteWrapper(dbPath, '!!!@@@###')).toThrow('Table name must include at least one alphanumeric or underscore character.');
    });

    test('strict mode rejects mismatched top-level types', () => {
        const wrapper = new SQLiteWrapper<{ score: number }>(dbPath, 'strict_mode_test', {
            autoEnsure: { score: 0 },
            strict: true,
        });

        expect(() => wrapper.set('user1', 10 as unknown as { score: number })).toThrow('Type of value does not match the type of autoEnsure.');
    });

    test('delete and ensure functionality', () => {
        const defaultValue = { sub1: { sub11: { a: 3, b: 'hello' }, sub12: [1, 2, 3], sub13: 'hey' }, sub2: ['hi', 'there'], sub3: 5, sub4: 'welcome' };
        const wrapper = new SQLiteWrapper(dbPath, 'delete_test', { autoEnsure: defaultValue });

        wrapper.set('key1', 'value1', 'nested.path.subpath');
        expect(wrapper.get('key1', 'nested.path.subpath')).toBe('value1');
        wrapper.set('key1', null);
        expect(wrapper.get('key1')).toBeNull();

        wrapper.set('key2', 'value2');
        expect(wrapper.get('key2')).toBe('value2');
        wrapper.delete('key2');
        expect(wrapper.get('key2')).toBeNull();

        const ensuredValue = wrapper.ensure('key3');
        expect(ensuredValue).toEqual(defaultValue);

        wrapper.set('key3', 'newValue', 'sub1.sub11');
        expect(wrapper.get('key3', 'sub1.sub11')).toBe('newValue');
        expect(wrapper.get('key3', 'sub1')).toEqual({ sub11: 'newValue', sub12: [1, 2, 3], sub13: 'hey' });

        expect(wrapper.get('key3', 'sub2')).toEqual(['hi', 'there']);
        wrapper.set('key3', 'newValue2', 'sub2');
        expect(wrapper.get('key3', 'sub2')).toBe('newValue2');

        wrapper.set('key3', { new: 'value3' }, 'sub3');
        expect(wrapper.get('key3', 'sub3')).toEqual({ new: 'value3' });
    });

    test('increment and decrement values', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'inc_dec_test', { autoEnsure: 0 });
        wrapper.set('key4', 10);
        wrapper.inc('key4');
        expect(wrapper.get('key4')).toBe(11);

        wrapper.dec('key4', '');
        expect(wrapper.get('key4')).toBe(10);
    });

    test('decrement supports nested dir paths', () => {
        const wrapper = new SQLiteWrapper<{ stats: { count: number } }>(dbPath, 'inc_dec_nested_test', {
            autoEnsure: { stats: { count: 2 } },
        });

        wrapper.ensure('user1');
        wrapper.dec('user1', 'stats.count');

        expect(wrapper.get('user1', 'stats.count')).toBe(1);
    });

    test('typed path APIs work for nested fields', () => {
        const wrapper = new SQLiteWrapper<{ profile: { score: number; tag: string } }>(dbPath, 'typed_path_test', {
            autoEnsure: { profile: { score: 0, tag: 'n/a' } },
        });

        wrapper.ensure('user1');
        wrapper.setPath('user1', 'profile.tag', 'pro');
        wrapper.incPath('user1', 'profile.score');
        wrapper.mathPath('user1', 'profile.score', '+', 4);
        wrapper.decPath('user1', 'profile.score');

        expect(wrapper.getPath('user1', 'profile.tag')).toBe('pro');
        expect(wrapper.getPath('user1', 'profile.score')).toBe(4);
    });

    test('ensure does not mutate frozen autoEnsure template', () => {
        const template = { info: { score: 1, level: 1 }, flags: { active: true } };
        const wrapper = new SQLiteWrapper<typeof template>(dbPath, 'ensure_non_mutating_test', { autoEnsure: template });

        wrapper.set('player1', { info: { score: 10, level: 1 }, flags: { active: true } });

        expect(() => wrapper.ensure('player1')).not.toThrow();
        expect(wrapper.get('player1')).toEqual({ info: { score: 10, level: 1 }, flags: { active: true } });
        expect(template).toEqual({ info: { score: 1, level: 1 }, flags: { active: true } });
    });

    test('ensure supports per-call default template without autoEnsure', () => {
        const wrapper = new SQLiteWrapper<{ counter: number }>(dbPath, 'ensure_default_value_test');

        const ensured = wrapper.ensure('item1', { counter: 5 });
        expect(ensured).toEqual({ counter: 5 });
        expect(wrapper.get('item1')).toEqual({ counter: 5 });
    });

    test('ensureDeep merges partial defaults onto base template', () => {
        type Schema = { profile: { score: number; level: number; name: string } };
        const wrapper = new SQLiteWrapper<Schema>(dbPath, 'ensure_deep_test');

        const ensured = wrapper.ensureDeep(
            'userA',
            { profile: { score: 10 } },
            { profile: { score: 0, level: 1, name: 'unknown' } }
        );

        expect(ensured).toEqual({ profile: { score: 10, level: 1, name: 'unknown' } });
        expect(wrapper.get('userA')).toEqual({ profile: { score: 10, level: 1, name: 'unknown' } });
    });

    test('ensure throws without autoEnsure and without default', () => {
        const wrapper = new SQLiteWrapper<{ count: number }>(dbPath, 'ensure_without_template_test');
        expect(() => wrapper.ensure('missing')).toThrow('autoEnsure is not set, and no default value is provided.');
    });

    test('getAllSafe skips malformed rows', () => {
        const wrapper = new SQLiteWrapper<{ ok: boolean }>(dbPath, 'get_all_safe_test');
        wrapper.set('good', { ok: true });

        wrapper.db.prepare(`INSERT OR REPLACE INTO ${wrapper.name} (key, value) VALUES (?, ?)`).run('bad', 'not-valid-json');

        const safe = wrapper.getAllSafe();
        expect(safe.entries).toEqual({ good: { ok: true } });
        expect(safe.invalidKeys).toContain('bad');
    });

    test('tryGetAll returns structured error for malformed rows', () => {
        const wrapper = new SQLiteWrapper<{ ok: boolean }>(dbPath, 'try_get_all_test');
        wrapper.db.prepare(`INSERT OR REPLACE INTO ${wrapper.name} (key, value) VALUES (?, ?)`).run('broken', 'not-valid-json');

        const result = wrapper.tryGetAll();
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('Failed to parse JSON for key "broken".');
        }
    });

    test('getAll throws with key-specific message on malformed rows', () => {
        const wrapper = new SQLiteWrapper<{ ok: boolean }>(dbPath, 'get_all_throw_test');
        wrapper.db.prepare(`INSERT OR REPLACE INTO ${wrapper.name} (key, value) VALUES (?, ?)`).run('bad_key', 'not-valid-json');

        expect(() => wrapper.getAll()).toThrow('Failed to parse JSON for key "bad_key".');
    });

    test('get with dir throws parse error for malformed row JSON', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'get_parse_error_test');
        wrapper.db.prepare(`INSERT OR REPLACE INTO ${wrapper.name} (key, value) VALUES (?, ?)`).run('broken', 'not-valid-json');

        expect(() => wrapper.get('broken', 'nested.path')).toThrow('Failed to parse JSON from database.');
    });

    test('get with dir returns null when traversing into primitive', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'primitive_path_test');
        wrapper.set('user', { info: 1 });

        expect(wrapper.get('user', 'info.value')).toBeNull();
    });

    test('math operations', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'math_test');
        wrapper.set('key5', 10);
        wrapper.math('key5', '+', 5);
        expect(wrapper.get('key5')).toBe(15);

        wrapper.math('key5', '*', 2);
        expect(wrapper.get('key5')).toBe(30);

        wrapper.math('key5', '/', 3);
        expect(wrapper.get('key5')).toBeCloseTo(10);
    });

    test('math guards division and modulo by zero', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'math_zero_test');
        wrapper.set('count', 10);

        expect(() => wrapper.math('count', '/', 0)).toThrow('Division by zero is not allowed.');
        expect(() => wrapper.math('count', '%', 0)).toThrow('Modulo by zero is not allowed.');
    });

    test('tryMath returns structured result', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'try_math_test');
        wrapper.set('count', 10);

        const success = wrapper.tryMath('count', '+', 5);
        expect(success.ok).toBe(true);
        if (success.ok) {
            expect(success.value).toBe(15);
        }

        const failure = wrapper.tryMath('count', '/', 0);
        expect(failure.ok).toBe(false);
        if (!failure.ok) {
            expect(failure.error.message).toBe('Division by zero is not allowed.');
        }
    });

    test('array operations with push and includes', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'array_test');
        wrapper.set('key6', []);
        wrapper.push('key6', 'value6', '');
        expect(wrapper.get('key6')).toEqual(['value6']);

        const includes = wrapper.has('key6');
        expect(includes).toBe(true);
    });

    test('push throws when target is not an array', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'array_error_test');
        wrapper.set('notArray', { value: 1 });

        expect(() => wrapper.push('notArray', 'x')).toThrow('The value at the specified key and path is not an array.');
    });

    test('filter, findKey, and find', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'filter_test');
        wrapper.set('key7', 20);
        wrapper.set('key8', 30);

        const filtered = wrapper.filter((value: any) => value > 25);
        expect(filtered).toHaveProperty('key8', 30);

        const foundKey = wrapper.findKey((value: any) => value === 30);
        expect(foundKey).toBe('key8');

        const foundValue = wrapper.find((value: any) => value === 30);
        expect(foundValue).toBe(30);
    });

    test('getAll, random, keyArray, and length', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'misc_test');
        wrapper.set('key9', 'value9');
        wrapper.set('key10', 'value10');

        const allEntries = wrapper.getAll();
        expect(allEntries).toHaveProperty('key9', 'value9');
        expect(allEntries).toHaveProperty('key10', 'value10');

        const randomValue = wrapper.random();
        expect(['value9', 'value10']).toContain(randomValue);

        const keys = wrapper.keyArray();
        expect(keys).toEqual(expect.arrayContaining(['key9', 'key10']));

        const length = wrapper.length();
        expect(length).toBe(2);
    });

    test('autonum generates unique codes', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'autonum_test');
        const code1 = wrapper.autonum();
        const code2 = wrapper.autonum();
        expect(code1).not.toBe(code2);
    });
});
