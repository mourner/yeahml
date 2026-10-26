const BREAK = 10;
const TAB = 9;
const SPACE = 32;
const HASH = 35;
const PERCENT = 37;
const COMMA = 44;
const HYPHEN = 45;
const COLON = 58;
const GREATER = 62;
const QUOTE_DOUBLE = 34;
const QUOTE_SINGLE = 39;
const PLUS = 43;
const BRACKET_OPEN = 91;
const BACKSLASH = 92;
const BRACKET_CLOSE = 93;
const BRACE_OPEN = 123;
const PIPE = 124;
const BRACE_CLOSE = 125;

const SCALAR = 0;
const BLOCK_MAP = 1;
const KEY = 2;
const VALUE = 3;
const BLOCK_SEQ = 4;
const BLOCK_ENTRY = 5;
const BLOCK_END = 6;
const DOCUMENT_END = 7;
const SINGLE_QUOTED = 8;
const DOUBLE_QUOTED = 9;
const BLOCK_SCALAR = 10;
const FLOW_SEQ = 11;
const FLOW_SEQ_END = 12;

const types = [
    'scalar', 'mapping', 'key', 'value', 'sequence', 'sequence entry', 'block end', 'document end',
    'quoted scalar', 'quoted scalar', 'block scalar', 'flow sequence', 'flow sequence end'
];

const ESCAPES = {
    '0': '\0',
    a: '\x07',
    b: '\b',
    t: '\t',
    n: '\n',
    v: '\v',
    f: '\f',
    r: '\r',
    e: '\x1B',
    '"': '"',
    '/': '/',
    '\\': '\\',
    ' ': ' ',   // backslash + space → space
    '\t': '\t', // backslash + literal tab → tab
    N: '\x85',
    _: '\xA0',
    L: '\u2028',
    P: '\u2029'
};

const HEX_ESCAPES = {x: 2, u: 4, U: 8};

// A line break with surrounding whitespace and any following blank lines, folded in quoted scalars.
const SINGLE_QUOTED_RE = /''|[ \t]*\n[ \t\n]*/g;
// Same, plus escapes; matching left to right keeps escaped whitespace (e.g. "\t") from being trimmed by a fold.
const DOUBLE_QUOTED_RE = /\\(x[^]{0,2}|u[^]{0,4}|U[^]{0,8}|\n[ \t\n]*|[^])|[ \t]*\n[ \t\n]*/g;

// Number of blank lines within a folded line break match.
const blankLines = m => m.split('\n').length - 2;
const fold = m => blankLines(m) > 0 ? '\n'.repeat(blankLines(m)) : ' ';

const isWhite = c => c === SPACE || c === TAB;

function syntaxError(s, msg, pos) {
    let line = 1, col = 1;
    for (let i = 0; i < pos; i++) {
        if (s.charCodeAt(i) === BREAK) { line++; col = 1; } else col++;
    }
    return new Error(`${msg} at line ${line}, col ${col}.`);
}

function tokenize(s) {
    let pos = 0;
    const tokens = [];
    const indents = [];
    const len = s.length;
    let lineBegin = 0;
    let lineStart = true;
    let inValue = false; // true after a map key or "---" on the current line, where a key or "- " can't start a block

    // Returns true if p is at EOF or at a space, tab or line break.
    const isBlank = p => p >= len || isWhite(s.charCodeAt(p)) || s.charCodeAt(p) === BREAK;

    // Returns true if a "---" or "..." document marker followed by whitespace or EOF starts at p.
    const isMarker = (p, marker) => s.startsWith(marker, p) && isBlank(p + 3);

    // Returns true if pos points to a valid block scalar header (optional -/+, optional comment, then newline).
    const isBlockScalarHeader = (p) => {
        if (s.charCodeAt(p) === HYPHEN || s.charCodeAt(p) === PLUS) p++;
        while (p < len && s.charCodeAt(p) === SPACE) p++;
        if (p < len && s.charCodeAt(p) === HASH) while (p < len && s.charCodeAt(p) !== BREAK) p++;
        return p >= len || s.charCodeAt(p) === BREAK;
    };

    // Returns the position of the closing quote for a quoted scalar with content starting at p (len if unterminated).
    const closingQuote = (p, quote) => {
        while (p < len) {
            const c = s.charCodeAt(p);
            if (c === quote) {
                if (quote === QUOTE_SINGLE && s.charCodeAt(p + 1) === QUOTE_SINGLE) p += 2; // '' escape
                else return p;
            } else {
                p += quote === QUOTE_DOUBLE && c === BACKSLASH ? 2 : 1; // skip escaped char
            }
        }
        return len;
    };

    // Throws unless the rest of the line starting at p is whitespace with an optional comment.
    function expectLineEnd(p, what) {
        const start = p;
        while (isWhite(s.charCodeAt(p))) p++;
        const c = s.charCodeAt(p);
        if (p < len && c !== BREAK && !(c === HASH && p > start)) {
            throw syntaxError(s, `Unexpected character after ${what}`, p);
        }
    }

    // Tokenizes a flat single-line flow sequence of scalars starting after "[", returning the position after "]".
    function flowSequence(p) {
        const skipSpaces = () => { while (isWhite(s.charCodeAt(p))) p++; };
        const isEntryEnd = q => isBlank(q) || s.charCodeAt(q) === COMMA || s.charCodeAt(q) === BRACKET_CLOSE;

        skipSpaces();
        if (s.charCodeAt(p) === BRACKET_CLOSE) return p + 1; // empty sequence

        while (true) {
            skipSpaces();
            const itemStart = p;
            let c = s.charCodeAt(p);

            if (c === COMMA || c === BRACKET_CLOSE) throw syntaxError(s, 'Empty flow sequence entry', p);
            if (c === HYPHEN && isEntryEnd(p + 1)) throw syntaxError(s, 'Unexpected "-" in flow sequence', p);

            if (c === QUOTE_SINGLE || c === QUOTE_DOUBLE) {
                p = closingQuote(p + 1, c);
                const nlPos = s.indexOf('\n', itemStart);
                if (nlPos !== -1 && nlPos < p) throw syntaxError(s, 'Unterminated flow sequence', nlPos);
                if (p >= len) throw syntaxError(s, 'Unterminated string', itemStart);
                tokens.push(c === QUOTE_SINGLE ? SINGLE_QUOTED : DOUBLE_QUOTED, itemStart + 1, p++);

            } else if (c !== HASH && c !== BREAK && p < len) { // plain scalar
                let end = p;
                while (p < len) {
                    c = s.charCodeAt(p);
                    if (c === COMMA || c === BRACKET_CLOSE || c === BREAK || (c === HASH && end < p)) break;
                    if (c === BRACKET_OPEN || c === BRACE_OPEN || c === BRACE_CLOSE) {
                        throw syntaxError(s, 'Nested flow collections are not supported', p);
                    }
                    if (c === COLON && isEntryEnd(p + 1)) throw syntaxError(s, 'Flow mappings are not supported', p);
                    p++;
                    if (!isWhite(c)) end = p;
                }
                tokens.push(SCALAR, itemStart, end);
            }

            skipSpaces();
            c = s.charCodeAt(p);
            if (c === BRACKET_CLOSE) return p + 1;
            if (c === COMMA) { p++; continue; }
            if (c === HASH) throw syntaxError(s, 'Unexpected comment in flow sequence', p);
            if (c === BREAK || p >= len) throw syntaxError(s, 'Unterminated flow sequence', p);
            throw syntaxError(s, 'Unexpected character in flow sequence', p);
        }
    }

    // Opens or closes blocks for a map key or sequence entry at blockPos. Levels are 2 * column for maps and
    // 2 * column + 1 for sequences, so a sequence nests in a map at the same column, and anything indented past "-"
    // nests in the sequence.
    function handleIndents(blockType, blockPos) {
        const level = 2 * (blockPos - lineBegin) + (blockType === BLOCK_SEQ ? 1 : 0);
        if (indents.length === 0 || level > indents.at(-1)) {
            indents.push(level);
            tokens.push(blockType, blockPos, blockPos);
        } else {
            while (indents.length > 0 && level !== indents.at(-1)) {
                indents.pop();
                tokens.push(BLOCK_END, blockPos, blockPos);
            }
            if (indents.length === 0) throw syntaxError(s, 'Bad indentation', blockPos);
        }
    }

    function pushKey(start, keyType, keyStart, keyEnd, colon) {
        if (inValue) throw syntaxError(s, 'Unexpected key in a value (values containing ": " must be quoted)', start);
        handleIndents(BLOCK_MAP, start);
        tokens.push(KEY, start, start, keyType, keyStart, keyEnd, VALUE, colon, colon);
        inValue = true;
    }

    while (pos <= len) {
        const start = pos;
        let c = s.charCodeAt(pos++);

        if (c === HASH || (lineStart && c === PERCENT)) { // comment or directive: skip to end of line
            while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;

        } else if (c === BREAK) { // line break; reset indent
            while (pos < len && s.charCodeAt(pos) === SPACE) pos++;
            if (pos < len && s.charCodeAt(pos) === TAB) {
                // scan ahead: if rest of line is only whitespace, it's a blank line — skip it
                let p = pos;
                while (p < len && s.charCodeAt(p) !== BREAK) {
                    if (!isWhite(s.charCodeAt(p))) throw syntaxError(s, 'Tab character in indentation', pos);
                    p++;
                }
                pos = p; // at next BREAK or EOF; outer loop will handle it
                continue;
            }
            lineBegin = start + 1;
            lineStart = true;
            inValue = false;

        } else if (isWhite(c)) { // spaces/tabs; skip
            while (pos < len && isWhite(s.charCodeAt(pos))) pos++;

        } else if (lineStart && isMarker(start, '---')) { // "---": document separator, skip
            pos += 2;
            inValue = true;

        } else if (lineStart && isMarker(start, '...')) { // "...": document end marker
            break;

        } else if (c === HYPHEN && isBlank(pos)) { // "- " or "-\n": sequence entry
            if (inValue) throw syntaxError(s, 'Unexpected sequence entry in a value', start);
            lineStart = false;
            handleIndents(BLOCK_SEQ, start);
            tokens.push(BLOCK_ENTRY, start, start);

        } else if (c === BRACKET_OPEN) { // flow sequence (flat, single-line)
            lineStart = false;
            tokens.push(FLOW_SEQ, start, start);
            pos = flowSequence(pos);
            tokens.push(FLOW_SEQ_END, pos - 1, pos - 1);
            expectLineEnd(pos, 'flow sequence');

        } else if (c === BRACE_OPEN) {
            throw syntaxError(s, 'Flow mappings are not supported', start);

        } else if (c === BRACKET_CLOSE || c === BRACE_CLOSE || c === COMMA) {
            throw syntaxError(s, `Unexpected "${s[start]}"`, start);

        } else if (c === QUOTE_SINGLE || c === QUOTE_DOUBLE) { // quoted scalar
            lineStart = false;
            pos = closingQuote(pos, c);
            if (pos >= len) throw syntaxError(s, 'Unterminated string', start);

            const contentEnd = pos++;
            const tokenType = c === QUOTE_SINGLE ? SINGLE_QUOTED : DOUBLE_QUOTED;

            // check if it's a map key (": " or ":\n" follows, ignoring whitespace)
            let colon = pos;
            while (isWhite(s.charCodeAt(colon))) colon++;

            if (s.charCodeAt(colon) === COLON && isBlank(colon + 1)) {
                const nlPos = s.indexOf('\n', start);
                if (nlPos !== -1 && nlPos < contentEnd) throw syntaxError(s, 'Multi-line implicit key', start);
                pushKey(start, tokenType, start + 1, contentEnd, colon);
                pos = colon + 1;
            } else {
                tokens.push(tokenType, start + 1, contentEnd);
                expectLineEnd(pos, 'quoted scalar');
            }

        } else if ((c === PIPE || c === GREATER) && isBlockScalarHeader(pos)) { // block scalar (literal | or folded >)
            lineStart = false;
            const blockLevel = indents.length ? indents.at(-1) >> 1 : -1; // column of the parent node
            while (pos < len && s.charCodeAt(pos) !== BREAK) pos++; // skip the rest of the header
            pos++; // past '\n'
            let blockIndent = -1;

            while (pos < len) {
                const lineBegin = pos;
                while (pos < len && s.charCodeAt(pos) === SPACE) pos++;
                const lineIndent = pos - lineBegin;
                if (pos >= len || s.charCodeAt(pos) === BREAK) { // empty line
                    if (pos < len) pos++;
                    continue;
                }
                if (lineIndent === 0 && (isMarker(pos, '---') || isMarker(pos, '...'))) {
                    pos = lineBegin; // document marker ends a zero-indented top-level block
                    break;
                }
                if (blockIndent === -1) {
                    if (lineIndent <= blockLevel) { pos = lineBegin; break; } // empty block
                    blockIndent = lineIndent;
                } else if (lineIndent < blockIndent) { // end of block
                    pos = lineBegin;
                    break;
                }
                while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;
                if (pos < len) pos++;
            }

            tokens.push(BLOCK_SCALAR, start, pos);

            lineBegin = pos;
            lineStart = true;
            inValue = false;

        } else if (c === PIPE || c === GREATER) {
            throw syntaxError(s, 'Invalid block scalar header', start);

        } else { // plain scalar
            lineStart = false;
            let trailing = 0;

            while (pos <= len) {
                c = s.charCodeAt(pos);

                if (c === BREAK || pos === len || (c === HASH && trailing > 0)) { // end of scalar
                    tokens.push(SCALAR, start, pos - trailing);
                    break;
                }
                if (c === COLON && isBlank(pos + 1)) { // map key
                    pushKey(start, SCALAR, start, pos - trailing, pos);
                    pos++;
                    break;
                }
                trailing = isWhite(c) ? trailing + 1 : 0;
                pos++;
            }
        }
    }

    for (let i = 0; i < indents.length; i++) tokens.push(BLOCK_END, len, len);
    tokens.push(DOCUMENT_END, len, len);

    return tokens;
}

function parseTokens(s, tokens) {
    let i = 0;
    let nextType = tokens[0];
    let start, end;

    function accept(type) {
        if (nextType === type) {
            start = tokens[i + 1];
            end = tokens[i + 2];
            i += 3;
            nextType = tokens[i];
            return true;
        }
        return false;
    }

    function expect(expectedType) {
        if (!accept(expectedType)) {
            throw syntaxError(s, `Expected ${types[expectedType]}, got ${types[nextType]}`, tokens[i + 1]);
        }
    }

    function processDoubleQuoted(qStart, qEnd) {
        return s.slice(qStart, qEnd).replace(DOUBLE_QUOTED_RE, (m, esc, offset) => {
            if (esc === undefined) return fold(m);
            const c = esc[0];
            const n = HEX_ESCAPES[c];
            if (n) {
                const hex = esc.slice(1);
                const code = parseInt(hex, 16);
                if (hex.length < n || !/^[0-9a-fA-F]+$/.test(hex) || code > 0x10FFFF) {
                    throw syntaxError(s, `Invalid escape sequence "\\${esc}"`, qStart + offset + 1);
                }
                return String.fromCodePoint(code);
            }
            if (c === '\n') return '\n'.repeat(blankLines(esc)); // escaped break: only blank lines after it produce output
            if (c in ESCAPES) return ESCAPES[c];
            throw syntaxError(s, `Unknown escape sequence "\\${c}"`, qStart + offset + 1);
        });
    }

    function parseBlockScalar(header, lEnd) {
        const lStart = s.indexOf('\n', header) + 1 || lEnd; // no content if the header ends the input
        const lines = s.slice(lStart, lEnd).split('\n');
        if (lines.at(-1) === '') lines.pop();

        const chomp = s.charCodeAt(header + 1); // HYPHEN to strip, PLUS to keep, otherwise clip
        const first = lines.find(l => /[^ ]/.test(l)); // first line with non-space content
        if (first === undefined) return chomp === PLUS ? '\n'.repeat(lines.length) : '';

        const blockIndent = first.search(/[^ ]/);
        let result = '';

        if (s.charCodeAt(header) === GREATER) {
            // folding: a break between two regular lines becomes a space, or is dropped if blank lines follow it;
            // breaks next to more-indented lines are kept
            let prevRegular = null;
            let blanks = 0;
            for (const rawLine of lines) {
                const line = rawLine.slice(blockIndent);
                if (line === '') { blanks++; continue; }
                const regular = !isWhite(line.charCodeAt(0));
                if (prevRegular === null) result += '\n'.repeat(blanks);
                else if (prevRegular && regular) result += blanks > 0 ? '\n'.repeat(blanks) : ' ';
                else result += '\n'.repeat(blanks + 1);
                result += line;
                prevRegular = regular;
                blanks = 0;
            }
            result += '\n'.repeat(blanks);
        } else {
            result = lines.map(l => l.slice(blockIndent)).join('\n');
        }

        if (chomp === PLUS) return `${result}\n`;
        let e = result.length;
        while (e > 0 && result.charCodeAt(e - 1) === BREAK) e--;
        return result.slice(0, e) + (chomp === HYPHEN ? '' : '\n');
    }

    function acceptScalar() {
        if (accept(SCALAR)) return s.slice(start, end);
        if (accept(SINGLE_QUOTED)) return s.slice(start, end).replace(SINGLE_QUOTED_RE, m => m === '\'\'' ? '\'' : fold(m));
        if (accept(DOUBLE_QUOTED)) return processDoubleQuoted(start, end);
        return undefined;
    }

    function expectScalar() {
        const v = acceptScalar();
        if (v !== undefined) return v;
        throw syntaxError(s, `Expected scalar, got ${types[nextType]}`, tokens[i + 1]);
    }

    function block() {
        const scalar = acceptScalar();
        if (scalar !== undefined) return scalar;

        if (accept(BLOCK_SEQ)) {
            const seq = [];
            while (accept(BLOCK_ENTRY)) seq.push(block() ?? '');
            expect(BLOCK_END);
            return seq;
        }

        if (accept(BLOCK_MAP)) {
            const map = {};
            const seen = new Set();
            while (accept(KEY)) {
                const key = expectScalar();
                if (seen.has(key)) throw syntaxError(s, `Duplicate key "${key}"`, start);
                seen.add(key);
                expect(VALUE);
                const value = block() ?? '';
                if (key !== '__proto__') map[key] = value; // skip to avoid setting the prototype
            }
            expect(BLOCK_END);
            return map;
        }

        if (accept(FLOW_SEQ)) {
            const seq = [];
            while (!accept(FLOW_SEQ_END)) seq.push(expectScalar());
            return seq;
        }

        if (accept(BLOCK_SCALAR)) return parseBlockScalar(start, end);

        return null;
    }

    const result = block();
    expect(DOCUMENT_END);
    return result;
}

export function parse(s) {
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); // byte order mark
    if (s.includes('\r')) s = s.replace(/\r\n?/g, '\n'); // normalize CRLF and CR line breaks
    return parseTokens(s, tokenize(s));
}
