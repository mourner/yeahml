import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from './index.js';

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

test('empty values', () => {
    assert.equal(parse(''), null);              // empty document
    assert.equal(parse('\n'), null);
    assert.equal(parse('# comment\n'), null);
    assert.deepEqual(parse('key:'), {key: ''}); // empty map value to empty string
    assert.deepEqual(parse('- '), ['']);        // empty sequence entry to empty string
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

test('block sequence with newline entry', () => {
    assert.deepEqual(parse('-\n  value'), ['value']);
    assert.deepEqual(parse('-\n  foo: bar'), [{foo: 'bar'}]);
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

    // trailing whitespace-only line at EOF (no final newline)
    assert.deepEqual(parse('key: |\n  content\n  '), {key: 'content\n'});
});

test('parse', () => {
    assert.deepEqual(parse(seqOfMaps), [{foo: {bak: '2'}}, {bar: 'foo', baz: '5'}]);
    assert.deepEqual(parse(nestedDoc), {
        hello: {
            oneasd: {
                foo: '',
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
