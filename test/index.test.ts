import SQLiteWrapper from '../src/index';
import fs from 'fs';
import path from 'path';

describe('SQLiteWrapper', () => {
    const dbPath = path.join(__dirname, 'test.db');
    const tableName = 'test_table';

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

    let wrapper: SQLiteWrapper<any>;

    beforeEach(() => {
        wrapper = new SQLiteWrapper(dbPath, tableName);
    });

    test('should initialize the table', () => {
        expect(() => {
            new SQLiteWrapper(dbPath, tableName);
        }).not.toThrow();
    });

    test('should set and get a value', () => {
        wrapper.set('key1', 'value1');
        const value = wrapper.get('key1');
        expect(value).toBe('value1');
    });

    test('should delete a key', () => {
        wrapper.set('key2', 'value2');
        wrapper.delete('key2');
        const value = wrapper.get('key2');
        expect(value).toBeNull();
    });

    test('should ensure a key with a default value', () => {
        const ensuredValue = wrapper.ensure('key3');
        expect(ensuredValue).toEqual({});
    });

    test('should check if a key exists', () => {
        wrapper.set('key4', 'value4');
        expect(wrapper.has('key4')).toBe(true);
        expect(wrapper.has('nonexistent')).toBe(false);
    });

    test('should increment and decrement a value', () => {
        wrapper.set('key5', 10);
        wrapper.inc('key5', '');
        expect(wrapper.get('key5')).toBe(11);

        wrapper.dec('key5', '');
        expect(wrapper.get('key5')).toBe(10);
    });

    test('should perform math operations', () => {
        wrapper.set('key6', 10);
        wrapper.math('key6', '+', 5);
        expect(wrapper.get('key6')).toBe(15);

        wrapper.math('key6', '*', 2);
        expect(wrapper.get('key6')).toBe(30);
    });

    test('should push values into an array', () => {
        wrapper.set('key7', []);
        wrapper.push('key7', 'value7', '');
        expect(wrapper.get('key7')).toEqual(['value7']);
    });

    test('should retrieve all entries', () => {
        wrapper.set('key8', 'value8');
        const allEntries = wrapper.getAll();
        expect(allEntries).toHaveProperty('key8', 'value8');
    });

    test('should retrieve a random value', () => {
        wrapper.set('key9', 'value9');
        const randomValue = wrapper.random();
        expect(randomValue).toBeTruthy();
    });

    test('should retrieve all keys', () => {
        wrapper.set('key10', 'value10');
        const keys = wrapper.keyArray();
        expect(keys).toContain('key10');
    });

    test('should filter entries', () => {
        wrapper.set('key11', 20);
        wrapper.set('key12', 30);
        const filtered = wrapper.filter((value: any) => value > 25);
        expect(filtered).toHaveProperty('key12', 30);
    });

    test('should find a key', () => {
        wrapper.set('key13', 40);
        const foundKey = wrapper.findKey((value: any) => value === 40);
        expect(foundKey).toBe('key13');
    });

    test('should find a value', () => {
        wrapper.set('key14', 50);
        const foundValue = wrapper.find((value: any) => value === 50);
        expect(foundValue).toBe(50);
    });

    test('should check if a value is included in an array', () => {
        wrapper.set('key15', ['value15']);
        const includes = wrapper.includes('key15', 'value15');
        expect(includes).toBe(true);
    });
});
