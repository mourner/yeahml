import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from './index.js';

test('empty values', () => {
    assert.equal(parse(''), null); // empty document
    assert.equal(parse('\n'), null);
    assert.equal(parse('# comment\n'), null);
    assert.deepEqual(parse('key:'), {key: ''}); // empty map value to empty string
    assert.deepEqual(parse('- '), ['']); // empty sequence entry to empty string
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

    assert.equal(parse('"back\\/slash"'), 'back/slash');  // \/ escape
    assert.equal(parse('"bell\\b"'), 'bell\b');           // \b escape
    assert.equal(parse('"\\x41"'), 'A');                  // \x hex escape

    assert.throws(() => parse('"\\q"'), {message: 'Unknown escape sequence "\\q" at line 1, col 3.'});
    assert.throws(() => parse('"unterminated'), {message: 'Unterminated string at line 1, col 1.'});
    assert.throws(() => parse('"spans\nlines"'), {message: 'Unterminated string at line 1, col 1.'});
});

test('document separator with content', () => {
    assert.deepEqual(parse('--- |\n  content\n'), 'content\n'); // --- followed by space then content
    assert.deepEqual(parse('--- foo: bar'), {foo: 'bar'});
});

test('document end marker', () => {
    assert.deepEqual(parse('foo: bar\n...'), {foo: 'bar'});
    assert.deepEqual(parse('foo: bar\n...\nignored: content'), {foo: 'bar'});
});

test('trailing whitespace in scalars', () => {
    assert.deepEqual(parse('key: value\t'), {key: 'value'}); // trailing tab stripped
    assert.deepEqual(parse('foo: 1\n\t\nbar: 2'), {foo: '1', bar: '2'}); // blank line with tab
});

test('multiline plain scalars', () => {
    assert.throws(() => parse('a\nb'), {message: 'Expected DOCUMENT_END, got SCALAR at line 2, col 1.'});
    assert.throws(() => parse('foo: bar\nbaz'), {message: 'Expected BLOCK_END, got SCALAR at line 2, col 1.'});
    assert.throws(() => parse('key: value\n  continuation'), {message: 'Expected BLOCK_END, got SCALAR at line 2, col 3.'});
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

    // content after --- on same line
    assert.deepEqual(parse('--- |\n  content\n'), 'content\n');

    // ... ends the block
    assert.deepEqual(parse('key: |\n  line 1\n  line 2\n...'), {key: 'line 1\nline 2\n'});

    // lines between containing indent and block indent end the block
    assert.deepEqual(parse('a: |-\n  text\nb: clip'), {a: 'text', b: 'clip'});
});

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
