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
        result.push(type === 0 ? s.slice(start, end) : types[type]);
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
