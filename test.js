/* eslint @stylistic/indent: off */

import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, types} from './index.js';

const test1 = `
- foo:
    bak: 2
- bar: foo
  baz: 5`;

const test2 = `
hello:  # foo
  oneasd:
    foo:
    baz: ff   # bar
    bar:
    - foo: bar
    - baz
two: 20
mapping:
  sky: blue
  big sea: green`;

function tokenizeNice(s) {
    const tokens = tokenize(s);
    const result = [];

    for (let i = 0; i < tokens.length; i += 3) {
        const type = tokens[i];
        const start = tokens[i + 1];
        const end = tokens[i + 2];
        const name = types[type];
        result.push(name === 'SCALAR' || name === 'SINGLE_QUOTED' || name === 'DOUBLE_QUOTED' ? s.slice(start, end) : name);
    }

    return result;
}

test('tokenize', () => {
    assert.deepEqual(tokenizeNice(test1), [
        'BLOCK_SEQ',
        'BLOCK_ENTRY',
            'BLOCK_MAP',
            'KEY', 'foo', 'VALUE',
                'BLOCK_MAP',
                'KEY', 'bak',
                'VALUE', '2',
                'BLOCK_END',
            'BLOCK_END',
        'BLOCK_ENTRY',
            'BLOCK_MAP',
            'KEY', 'bar', 'VALUE', 'foo',
            'KEY', 'baz', 'VALUE', '5',
            'BLOCK_END',
        'BLOCK_END',
        'DOCUMENT_END']);

    assert.deepEqual(tokenizeNice(test2),  [
        'BLOCK_MAP',
        'KEY', 'hello', 'VALUE',
            'BLOCK_MAP',
            'KEY', 'oneasd', 'VALUE',
                'BLOCK_MAP',
                'KEY', 'foo', 'VALUE',
                'KEY', 'baz', 'VALUE', 'ff',
                'KEY', 'bar', 'VALUE',
                    'BLOCK_SEQ',
                    'BLOCK_ENTRY', 'BLOCK_MAP', 'KEY', 'foo', 'VALUE', 'bar', 'BLOCK_END',
                    'BLOCK_ENTRY', 'baz',
                    'BLOCK_END',
                'BLOCK_END',
            'BLOCK_END',
        'KEY', 'two', 'VALUE', '20',
        'KEY', 'mapping', 'VALUE',
            'BLOCK_MAP',
            'KEY', 'sky', 'VALUE', 'blue',
            'KEY', 'big sea', 'VALUE', 'green',
            'BLOCK_END',
        'BLOCK_END',
        'DOCUMENT_END']);
});

test('empty document', () => {
    assert.equal(parse(''), null);
    assert.equal(parse('\n'), null);
    assert.equal(parse('# comment\n'), null);
});

test('document separator', () => {
    assert.equal(parse('---'), null);
    assert.deepEqual(parse('---\nfoo: bar'), {foo: 'bar'});
});

test('tab indentation', () => {
    assert.throws(() => parse('foo:\n\tbar: 1'), /Tab character in indentation at line 2, col 1\./);
});

test('--- in value position', () => {
    assert.deepEqual(parse('foo: ---'), {foo: '---'});
    assert.deepEqual(parse('foo: ---\nbar: baz'), {foo: '---', bar: 'baz'});
});

test('bad indentation', () => {
    // indent doesn't match any open block level; error includes exact line and col
    assert.throws(() => parse('foo:\n  bar: 1\n baz: 2'), /Bad indentation at line 3, col 2\./);
    assert.throws(() => parse('a: 1\n  b: 2\n c: 3'), /Bad indentation at line 3, col 2\./);
});

test('duplicate keys', () => {
    // error includes key name and exact position of the duplicate
    assert.throws(() => parse('foo: 1\nfoo: 2'), /Duplicate key "foo" at line 2, col 1\./);
    assert.throws(() => parse('foo:\n  bar: 1\n  bar: 2'), /Duplicate key "bar" at line 3, col 3\./);
});

test('single-quoted strings', () => {
    // tokenizer emits raw content (without quotes, '' not yet unescaped)
    assert.deepEqual(tokenizeNice('\'hello world\''), ['hello world', 'DOCUMENT_END']);
    assert.deepEqual(tokenizeNice('\'it\'\'\'\'s\''), ['it\'\'\'\'s', 'DOCUMENT_END']);
    assert.deepEqual(tokenizeNice('\'key\': value'), ['BLOCK_MAP', 'KEY', 'key', 'VALUE', 'value', 'BLOCK_END', 'DOCUMENT_END']);

    // parser resolves '' escapes and strips quotes
    assert.equal(parse('\'hello world\''), 'hello world');
    assert.equal(parse('\'it\'\'s\''), 'it\'s');
    assert.equal(parse('\'\''), '');
    assert.deepEqual(parse('\'key\': value'), {key: 'value'});
    assert.deepEqual(parse('\'foo: bar\''), 'foo: bar'); // colon doesn't make it a key
    assert.deepEqual(parse('\'- item\''), '- item');     // hyphen doesn't make it a sequence

    // unterminated
    assert.throws(() => parse('\'unterminated'), /Unterminated string at line 1, col 1\./);
    assert.throws(() => parse('\'spans\nlines\''), /Unterminated string at line 1, col 1\./);
});

test('double-quoted strings', () => {
    // tokenizer emits raw content (without quotes, escapes not yet processed)
    assert.deepEqual(tokenizeNice('"hello world"'), ['hello world', 'DOCUMENT_END']);
    assert.deepEqual(tokenizeNice('"key": value'), ['BLOCK_MAP', 'KEY', 'key', 'VALUE', 'value', 'BLOCK_END', 'DOCUMENT_END']);

    // parser processes escapes
    assert.equal(parse('"hello world"'), 'hello world');
    assert.equal(parse('"hello\\nworld"'), 'hello\nworld');
    assert.equal(parse('"hello\\tworld"'), 'hello\tworld');
    assert.equal(parse('"it\\"s"'), 'it"s');
    assert.equal(parse('"back\\\\slash"'), 'back\\slash');
    assert.equal(parse('"\\u0041"'), 'A');
    assert.equal(parse('""'), '');
    assert.deepEqual(parse('"key": value'), {key: 'value'});

    // unknown escape
    assert.throws(() => parse('"\\q"'), /Unknown escape sequence/);

    // unterminated
    assert.throws(() => parse('"unterminated'), /Unterminated string at line 1, col 1\./);
    assert.throws(() => parse('"spans\nlines"'), /Unterminated string at line 1, col 1\./);
});

test('parse', () => {
    assert.deepEqual(parse(test1), [{foo: {bak: '2'}}, {bar: 'foo', baz: '5'}]);
    assert.deepEqual(parse(test2), {
        hello: {
            oneasd: {
                foo: null,
                baz: 'ff',
                bar: [
                    {foo: 'bar'},
                    'baz'
                ]
            }
        },
        two: '20',
        mapping: {
            sky: 'blue',
            'big sea': 'green'
        }
    });
});
