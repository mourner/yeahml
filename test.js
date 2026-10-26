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

test('directives', () => {
    assert.equal(parse('%YAML 1.2\n---\n'), null);
    assert.deepEqual(parse('%YAML 1.2\n---\nfoo: bar'), {foo: 'bar'});
    assert.deepEqual(parse('%TAG ! tag:example.com,2000:app/\n---\nfoo: bar'), {foo: 'bar'});
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

test('sequence entry edge cases', () => {
    assert.deepEqual(parse('-'), ['']); // lone hyphen at EOF → empty entry
    assert.deepEqual(parse('-\t-1'), ['-1']); // hyphen+tab as entry separator
    assert.deepEqual(parse('- |\n x\n'), ['x\n']); // compact seq + block scalar at indent 1
    assert.deepEqual(parse('- |-\n x\n'), ['x']); // compact seq + block scalar strip
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
    assert.throws(() => parse("'c\n d': 1"), {message: 'Multi-line implicit key at line 1, col 1.'});

    assert.equal(parse("'spans\nlines'"), 'spans lines'); // newline folds to space
    assert.equal(parse("'foo\n  bar'"), 'foo bar'); // leading indent stripped
    assert.equal(parse("'foo\n\nbar'"), 'foo\nbar'); // blank line → literal newline
    assert.equal(parse("'foo\n\n\nbar'"), 'foo\n\nbar'); // two blank lines → two newlines
    assert.equal(parse("'it''s\nfine'"), "it's fine"); // '' escape + fold
    assert.equal(parse("'foo  \n  bar'"), 'foo bar'); // trailing spaces stripped before fold
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
    assert.equal(parse('"bell\\b"'), 'bell\b'); // \b escape
    assert.equal(parse('"\\x41"'), 'A'); // \x hex escape

    assert.throws(() => parse('"\\q"'), {message: 'Unknown escape sequence "\\q" at line 1, col 3.'});
    assert.equal(parse('"\\u00e9\\U0001F600"'), 'é😀'); // \u and \U escapes
    assert.equal(parse('"\\N\\_\\L\\P"'), '\x85\xA0\u2028\u2029');
    assert.throws(() => parse('"\\x4"'), {message: 'Invalid escape sequence "\\x4" at line 1, col 3.'});
    assert.throws(() => parse('"\\u00zz"'), {message: 'Invalid escape sequence "\\u00zz" at line 1, col 3.'});
    assert.throws(() => parse('"unterminated'), {message: 'Unterminated string at line 1, col 1.'});

    assert.equal(parse('"spans\nlines"'), 'spans lines'); // newline folds to space
    assert.equal(parse('"foo\n  bar"'), 'foo bar'); // leading indent stripped
    assert.equal(parse('"foo\n\nbar"'), 'foo\nbar'); // blank line → literal newline
    assert.equal(parse('"foo  \n  bar"'), 'foo bar'); // trailing spaces stripped before fold
    assert.equal(parse('"foo\n\tbar"'), 'foo bar'); // leading tab stripped on continuation
    assert.equal(parse('"foo\n\t\nbar"'), 'foo\nbar'); // tab-only line counts as blank
    assert.equal(parse('"foo\\\nbar"'), 'foobar'); // escaped newline: no output, no space
    assert.deepEqual(parse('key:\tvalue'), {key: 'value'}); // tab as value separator

    assert.equal(parse('"1 trailing\\t\n    tab"'), '1 trailing\t tab'); // escape-produced tab not stripped before fold
    assert.equal(parse('"2 trailing\\t  \n    tab"'), '2 trailing\t tab'); // escape-produced tab + literal spaces stripped
    assert.equal(parse('"3 trailing\\\t\n    tab"'), '3 trailing\t tab'); // backslash-tab escape + fold

    assert.throws(() => parse('"c\n d": 1'), {message: 'Multi-line implicit key at line 1, col 1.'});
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
    assert.throws(() => parse('a\nb'), {message: 'Expected document end, got scalar at line 2, col 1.'});
    assert.throws(() => parse('foo: bar\nbaz'), {message: 'Expected block end, got scalar at line 2, col 1.'});
    assert.throws(() => parse('key: value\n  continuation'), {message: 'Expected block end, got scalar at line 2, col 3.'});
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
    assert.deepEqual(parse('key: |\nnext: value'), {key: '', next: 'value'});
    assert.deepEqual(parse('key: |-\nnext: value'), {key: '', next: 'value'});

    // trailing whitespace-only line at EOF (no final newline)
    assert.deepEqual(parse('key: |\n  content\n  '), {key: 'content\n'});

    // content after --- on same line
    assert.deepEqual(parse('--- |\n  content\n'), 'content\n');

    // ... ends the block
    assert.deepEqual(parse('key: |\n  line 1\n  line 2\n...'), {key: 'line 1\nline 2\n'});

    // lines between containing indent and block indent end the block
    assert.deepEqual(parse('a: |-\n  text\nb: clip'), {a: 'text', b: 'clip'});

    // tab as content (not indentation): space then tab in block line
    assert.deepEqual(parse('foo: |\n \t\nbar: 1\n'), {foo: '\t\n', bar: '1'});

    // keep (|+): preserves all trailing newlines
    assert.deepEqual(parse('key: |+\n  text\n\n\n'), {key: 'text\n\n\n'});
    assert.deepEqual(parse('key: |+\n  text\n'), {key: 'text\n'});
    assert.deepEqual(parse('key: |+\n\n'), {key: '\n'});          // single blank → \n
    assert.deepEqual(parse('key: |+\nnext: v'), {key: '', next: 'v'}); // empty keep → ''
    assert.deepEqual(parse('--- |+\n ab\n \n  \n...\n'), 'ab\n\n \n'); // space-only line is content, not blank
});

test('block scalar header comments', () => {
    assert.deepEqual(parse('key: | # comment\n  content\n'), {key: 'content\n'});
    assert.deepEqual(parse('key: |- # strip with comment\n  content\n'), {key: 'content'});
    assert.deepEqual(parse('key: |+ # keep with comment\n  content\n\n'), {key: 'content\n\n'});
    assert.deepEqual(parse('key: > # comment\n  foo\n  bar\n'), {key: 'foo bar\n'});
    assert.deepEqual(parse('key: >- # comment\n  foo\n'), {key: 'foo'});
});

test('folded block strings', () => {
    // clip (>): folds newlines to spaces, keeps one trailing newline
    assert.deepEqual(parse('key: >\n  foo\n  bar\n'), {key: 'foo bar\n'});
    assert.deepEqual(parse('key: >\n  foo\n\n  bar\n'), {key: 'foo\nbar\n'});  // blank line → newline
    assert.deepEqual(parse('key: >\n  foo\n\n\n  bar\n'), {key: 'foo\n\nbar\n'}); // two blank lines

    // strip (>-): removes all trailing newlines
    assert.deepEqual(parse('key: >-\n  foo\n  bar\n'), {key: 'foo bar'});

    // more-indented lines not folded
    assert.deepEqual(parse('key: >\n  foo\n    indented\n  bar\n'), {key: 'foo\n  indented\nbar\n'});

    // empty block
    assert.deepEqual(parse('key: >\nnext: value'), {key: '', next: 'value'});
    assert.deepEqual(parse('key: >-\nnext: value'), {key: '', next: 'value'});

    // nested
    assert.deepEqual(parse('outer:\n  key: >\n    inner\n'), {outer: {key: 'inner\n'}});

    // in sequence (compact notation)
    assert.deepEqual(parse('- >\n  foo\n  bar\n- baz'), ['foo bar\n', 'baz']);
    assert.deepEqual(parse('- >-\n  foo\n  bar\n- baz'), ['foo bar', 'baz']);

    // keep (>+): preserves all trailing newlines
    assert.deepEqual(parse('key: >+\n  foo\n  bar\n\n\n'), {key: 'foo bar\n\n\n'});
    assert.deepEqual(parse('key: >+\n\n'), {key: '\n'});
    assert.deepEqual(parse('key: >+\nnext: v'), {key: '', next: 'v'});
});

test('flow sequences', () => {
    assert.deepEqual(parse('tags: [foo, bar]'), {tags: ['foo', 'bar']});
    assert.deepEqual(parse('tags: []'), {tags: []});
    assert.deepEqual(parse('tags: [ ]'), {tags: []});
    assert.deepEqual(parse('tags: [ foo bar ,baz ]'), {tags: ['foo bar', 'baz']}); // whitespace trimmed
    assert.deepEqual(parse('t: [\'a, b\', "c\\"d", \'it\'\'s\']'), {t: ['a, b', 'c"d', "it's"]}); // quoted entries
    assert.deepEqual(parse('t: [http://x.com, a#b, -1, 2026-03-29]'), {t: ['http://x.com', 'a#b', '-1', '2026-03-29']});
    assert.deepEqual(parse('tags: [foo] # comment\nnext: 1'), {tags: ['foo'], next: '1'});
    assert.deepEqual(parse('- [a, b]\n- c'), [['a', 'b'], 'c']); // as sequence entry
    assert.deepEqual(parse('[a]'), ['a']); // top-level
    assert.deepEqual(parse('a: foo [b], c'), {a: 'foo [b], c'}); // brackets inside plain scalars are text

    assert.throws(() => parse('a: [a,,b]'), {message: 'Empty flow sequence entry at line 1, col 7.'});
    assert.throws(() => parse('a: [,a]'), {message: 'Empty flow sequence entry at line 1, col 5.'});
    assert.throws(() => parse('a: [a,]'), {message: 'Empty flow sequence entry at line 1, col 7.'}); // trailing comma
    assert.throws(() => parse('a: [a'), {message: 'Unterminated flow sequence at line 1, col 6.'});
    assert.throws(() => parse('a: [a,\n  b]'), {message: 'Unterminated flow sequence at line 1, col 7.'}); // multi-line
    assert.throws(() => parse('a: [\'x\n y\']'), {message: 'Unterminated flow sequence at line 1, col 7.'});
    assert.throws(() => parse('a: [\'x]'), {message: 'Unterminated string at line 1, col 5.'});
    assert.throws(() => parse('a: [a #b]'), {message: 'Unexpected comment in flow sequence at line 1, col 7.'});
    assert.throws(() => parse('a: [\'x\' y]'), {message: 'Unexpected character in flow sequence at line 1, col 9.'});
    assert.throws(() => parse('a: [[a]]'), {message: 'Nested flow collections are not supported at line 1, col 5.'});
    assert.throws(() => parse('a: [{x: 1}]'), {message: 'Nested flow collections are not supported at line 1, col 5.'});
    assert.throws(() => parse('a: [x: 1]'), {message: 'Flow mappings are not supported at line 1, col 6.'});
    assert.throws(() => parse('a: [a] b'), {message: 'Unexpected character after flow sequence at line 1, col 8.'});
    assert.throws(() => parse('[a]: b'), {message: 'Unexpected character after flow sequence at line 1, col 4.'});
});

test('flow mappings and stray flow indicators', () => {
    assert.throws(() => parse('a: {x: 1}'), {message: 'Flow mappings are not supported at line 1, col 4.'});
    assert.throws(() => parse('a: {}'), {message: 'Flow mappings are not supported at line 1, col 4.'});
    assert.throws(() => parse('a: ]'), {message: 'Unexpected "]" at line 1, col 4.'});
    assert.throws(() => parse('- , x'), {message: 'Unexpected "," at line 1, col 3.'});
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

test('CRLF line breaks and BOM', () => {
    assert.deepEqual(parse('a: 1\r\nb:\r\n- x\r\n- y\r\n'), {a: '1', b: ['x', 'y']});
    assert.deepEqual(parse('a: |\r\n  x\r\n  y\r\nb: "q\r\n  r"\r\n'), {a: 'x\ny\n', b: 'q r'});
    assert.deepEqual(parse('a: 1\rb: 2'), {a: '1', b: '2'});
    assert.deepEqual(parse('\uFEFFa: 1'), {a: '1'});
});

test('__proto__ key', () => {
    const result = parse('__proto__:\n  polluted: yes\nfoo: bar');
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.deepEqual(result, {foo: 'bar'});
});
