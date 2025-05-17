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

        wrapper.set('key1', 'null', 'nested.path2');
        expect(wrapper.get('key1', 'nested.path2')).toBe(null);
    });

    test('delete and ensure functionality', () => {
        const defaultValue = { sub1: { sub11: { a: 3, b: 'hello' }, sub12: [1, 2, 3], sub13: 'hey' }, sub2: ['hi', 'there'], sub3: 5, sub4: 'welcome' };
        const wrapper = new SQLiteWrapper(dbPath, 'delete_test', { autoEnsure: defaultValue });

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
        wrapper.inc('key4', '');
        expect(wrapper.get('key4')).toBe(11);

        wrapper.dec('key4', '');
        expect(wrapper.get('key4')).toBe(10);
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

    test('array operations with push and includes', () => {
        const wrapper = new SQLiteWrapper(dbPath, 'array_test');
        wrapper.set('key6', []);
        wrapper.push('key6', 'value6', '');
        expect(wrapper.get('key6')).toEqual(['value6']);

        const includes = wrapper.has('key6');
        expect(includes).toBe(true);
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
