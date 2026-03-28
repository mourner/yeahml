/* eslint @stylistic/indent: off */

import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, types} from './index.js';

// sequence of maps with nesting
const seqOfMaps = `
- foo:
    bak: 2
- bar: foo
  baz: 5`;

// complex nested maps and sequences with comments and null values
const nestedDoc = `
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
        const isScalar = name === 'SCALAR' || name === 'SINGLE_QUOTED' || name === 'DOUBLE_QUOTED';
        result.push(isScalar ? s.slice(start, end) : name);
    }
    return result;
}

test('tokenize', () => {
    assert.deepEqual(tokenizeNice(seqOfMaps), [
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

    assert.deepEqual(tokenizeNice(nestedDoc), [
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
    assert.throws(() => parse('foo:\n\tbar: 1'), {message: 'Tab character in indentation at line 2, col 1.'});
});

test('--- in value position', () => {
    assert.deepEqual(parse('foo: ---'), {foo: '---'});
    assert.deepEqual(parse('foo: ---\nbar: baz'), {foo: '---', bar: 'baz'});
});

test('bad indentation', () => {
    assert.throws(() => parse('foo:\n  bar: 1\n baz: 2'), {message: 'Bad indentation at line 3, col 2.'});
    assert.throws(() => parse('a: 1\n  b: 2\n c: 3'), {message: 'Bad indentation at line 3, col 2.'});
});

test('duplicate keys', () => {
    assert.throws(() => parse('foo: 1\nfoo: 2'), {message: 'Duplicate key "foo" at line 2, col 1.'});
    assert.throws(() => parse('foo:\n  bar: 1\n  bar: 2'), {message: 'Duplicate key "bar" at line 3, col 3.'});
    assert.throws(() => parse("'foo': 1\n'foo': 2"), {message: 'Duplicate key "foo" at line 2, col 2.'});
});

test('single-quoted strings', () => {
    // tokenizer emits raw content between quotes, '' escape not yet processed
    assert.deepEqual(tokenizeNice("'hello world'"), ['hello world', 'DOCUMENT_END']);
    assert.deepEqual(tokenizeNice("'key': value"), ['BLOCK_MAP', 'KEY', 'key', 'VALUE', 'value', 'BLOCK_END', 'DOCUMENT_END']);

    // parser strips quotes and resolves '' -> '
    assert.equal(parse("'hello world'"), 'hello world');
    assert.equal(parse("'it''s'"), "it's");
    assert.equal(parse("''"), '');
    assert.deepEqual(parse("'key': value"), {key: 'value'});
    assert.deepEqual(parse("'foo: bar'"), 'foo: bar'); // colon doesn't make it a key
    assert.deepEqual(parse("'- item'"), '- item');     // hyphen doesn't make it a sequence
    assert.deepEqual(parse("- 'hello'"), ['hello']);   // quoted value in sequence

    assert.throws(() => parse("'unterminated"), {message: 'Unterminated string at line 1, col 1.'});
    assert.throws(() => parse("'spans\nlines'"), {message: 'Unterminated string at line 1, col 1.'});
});

test('double-quoted strings', () => {
    // tokenizer emits raw content between quotes, escapes not yet processed
    assert.deepEqual(tokenizeNice('"hello world"'), ['hello world', 'DOCUMENT_END']);
    assert.deepEqual(tokenizeNice('"key": value'), ['BLOCK_MAP', 'KEY', 'key', 'VALUE', 'value', 'BLOCK_END', 'DOCUMENT_END']);

    // parser strips quotes and processes escape sequences
    assert.equal(parse('"hello world"'), 'hello world');
    assert.equal(parse('"hello\\nworld"'), 'hello\nworld');
    assert.equal(parse('"hello\\tworld"'), 'hello\tworld');
    assert.equal(parse('"it\\"s"'), 'it"s');
    assert.equal(parse('"back\\\\slash"'), 'back\\slash');
    assert.equal(parse('"\\u0041"'), 'A');
    assert.equal(parse('""'), '');
    assert.deepEqual(parse('"key": value'), {key: 'value'});
    assert.deepEqual(parse('- "hello"'), ['hello']); // quoted value in sequence

    assert.throws(() => parse('"\\q"'), {message: 'Unknown escape sequence "\\q" at line 1, col 3.'});
    assert.throws(() => parse('"unterminated'), {message: 'Unterminated string at line 1, col 1.'});
    assert.throws(() => parse('"spans\nlines"'), {message: 'Unterminated string at line 1, col 1.'});
});

test('literal block strings', () => {
    // clip (|): keeps one trailing newline
    assert.deepEqual(parse('key: |\n  line 1\n  line 2\n'), {key: 'line 1\nline 2\n'});
    assert.deepEqual(parse('key: |\n  line 1\n  line 2\nnext: value'), {key: 'line 1\nline 2\n', next: 'value'});

    // strip (|-): removes all trailing newlines
    assert.deepEqual(parse('key: |-\n  line 1\n  line 2\n'), {key: 'line 1\nline 2'});

    // nested
    assert.deepEqual(parse('outer:\n  key: |\n    inner\n'), {outer: {key: 'inner\n'}});

    // empty block
    assert.deepEqual(parse('key: |\nnext: value'), {key: '\n', next: 'value'});
    assert.deepEqual(parse('key: |-\nnext: value'), {key: '', next: 'value'});
});

test('parse', () => {
    assert.deepEqual(parse(seqOfMaps), [{foo: {bak: '2'}}, {bar: 'foo', baz: '5'}]);
    assert.deepEqual(parse(nestedDoc), {
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
