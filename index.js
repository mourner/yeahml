const BREAK = 10;
const TAB = 9;
const SPACE = 32;
const HASH = 35;
const COLON = 58;
const HYPHEN = 45;
const QUOTE_SINGLE = 39;
const QUOTE_DOUBLE = 34;
const BACKSLASH = 92;
const PIPE = 124;
const PERIOD = 46;

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
const LITERAL_BLOCK = 10;
const LITERAL_BLOCK_STRIP = 11;

const types = ['scalar', 'mapping', 'key', 'value', 'sequence', 'sequence entry', 'block end', 'document end', 'quoted scalar', 'quoted scalar', 'literal block', 'literal block'];

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
    '\\': '\\'
};

function posToLineCol(s, pos) {
    let line = 1, col = 1;
    for (let i = 0; i < pos; i++) {
        if (s.charCodeAt(i) === BREAK) { line++; col = 1; } else col++;
    }
    return `line ${line}, col ${col}`;
}

function tokenize(s) {
    let pos = 0;
    const tokens = [];
    const indents = [];
    const len = s.length;
    let indent = 0;
    let lineStart = true;

    function handleIndents(blockType, blockIndent, blockPos) {
        if (indents.length === 0 || blockIndent > indents.at(-1)) {
            indents.push(blockIndent);
            tokens.push(blockType, blockPos, blockPos);
        } else {
            while (indents.length > 0 && blockIndent !== indents.at(-1)) {
                indents.pop();
                tokens.push(BLOCK_END, blockPos, blockPos);
            }
            if (indents.length === 0) {
                throw new Error(`Bad indentation at ${posToLineCol(s, blockPos)}.`);
            }
        }
    }

    while (pos <= len) {
        const start = pos;
        let c = s.charCodeAt(pos++);

        if (c === HASH) { // comment
            while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;

        } else if (c === BREAK) { // line break; save indent
            while (pos < len && s.charCodeAt(pos) === SPACE) pos++;
            if (pos < len && s.charCodeAt(pos) === TAB) {
                // scan ahead: if rest of line is only whitespace, it's a blank line — skip it
                let p = pos;
                while (p < len && s.charCodeAt(p) !== BREAK) {
                    if (s.charCodeAt(p) !== SPACE && s.charCodeAt(p) !== TAB) {
                        throw new Error(`Tab character in indentation at ${posToLineCol(s, pos)}.`);
                    }
                    p++;
                }
                pos = p; // at next BREAK or EOF; outer loop will handle it
                continue;
            }
            indent = pos - start - 1;
            lineStart = true;

        } else if (c === SPACE) { // spaces; skip
            while (pos < len && s.charCodeAt(pos) === SPACE) pos++;

        } else if (lineStart && c === HYPHEN && s.charCodeAt(pos) === HYPHEN && s.charCodeAt(pos + 1) === HYPHEN &&
                   (pos + 2 >= len || s.charCodeAt(pos + 2) === BREAK || s.charCodeAt(pos + 2) === SPACE)) { // "---": document separator, skip
            pos += 2;

        } else if (lineStart && c === PERIOD && s.charCodeAt(pos) === PERIOD && s.charCodeAt(pos + 1) === PERIOD &&
                   (pos + 2 >= len || s.charCodeAt(pos + 2) === BREAK || s.charCodeAt(pos + 2) === SPACE)) { // "...": document end marker
            break;

        } else if (c === HYPHEN && s.charCodeAt(pos) === SPACE) { // "- ": sequence entry
            lineStart = false;
            pos++;
            indent++; // treat sequence entry as indented to support nested sequence on the same indentation
            handleIndents(BLOCK_SEQ, indent, start); // possibly end blocks or start new one
            tokens.push(BLOCK_ENTRY, start, start);
            indent++; // treat following tokens as indented for compact notation

        } else if (c === HYPHEN && s.charCodeAt(pos) === BREAK) { // "-\n": indented sequence entry
            lineStart = false;
            handleIndents(BLOCK_SEQ, indent, start);
            tokens.push(BLOCK_ENTRY, start, start);

        } else if (c === QUOTE_SINGLE || c === QUOTE_DOUBLE) { // quoted scalar
            lineStart = false;
            const quote = c;
            const contentStart = pos;
            while (pos < len) {
                c = s.charCodeAt(pos);
                if (c === BREAK) throw new Error(`Unterminated string at ${posToLineCol(s, start)}.`);
                if (c === quote) {
                    if (quote === QUOTE_SINGLE && s.charCodeAt(pos + 1) === QUOTE_SINGLE) {
                        pos += 2; // '' escape in single-quoted strings
                    } else {
                        break; // closing quote found
                    }
                } else {
                    if (quote === QUOTE_DOUBLE && c === BACKSLASH) pos++; // skip escaped char
                    pos++;
                }
            }
            if (pos >= len) throw new Error(`Unterminated string at ${posToLineCol(s, start)}.`);

            const contentEnd = pos;
            pos++; // past closing quote
            const tokenType = quote === QUOTE_SINGLE ? SINGLE_QUOTED : DOUBLE_QUOTED;
            // check if it's a map key (": " or ":\n" follows, ignoring spaces)
            let afterClose = pos;
            while (afterClose < len && s.charCodeAt(afterClose) === SPACE) afterClose++;

            if (s.charCodeAt(afterClose) === COLON &&
                (s.charCodeAt(afterClose + 1) === SPACE || s.charCodeAt(afterClose + 1) === BREAK || afterClose + 1 >= len)) {
                handleIndents(BLOCK_MAP, indent, start);
                tokens.push(KEY, start, start);
                tokens.push(tokenType, contentStart, contentEnd);
                tokens.push(VALUE, afterClose, afterClose);
                pos = afterClose + 1;
            } else {
                tokens.push(tokenType, contentStart, contentEnd);
            }

        } else if (c === PIPE && (s.charCodeAt(pos) === BREAK ||
                   (s.charCodeAt(pos) === HYPHEN && s.charCodeAt(pos + 1) === BREAK))) { // literal block scalar
            lineStart = false;
            const strip = s.charCodeAt(pos) === HYPHEN;
            if (strip) pos++;
            pos++; // past '\n'
            const contentStart = pos;
            let blockIndent = -1;

            while (pos < len) {
                const lineBegin = pos;
                while (pos < len && s.charCodeAt(pos) === SPACE) pos++;
                const lineIndent = pos - lineBegin;
                if (pos >= len || s.charCodeAt(pos) === BREAK) { // empty line
                    if (pos < len) pos++;
                    continue;
                }
                if (blockIndent === -1) {
                    if (lineIndent <= indent) { pos = lineBegin; break; } // empty block
                    blockIndent = lineIndent;
                } else if (lineIndent < blockIndent) { // end of block
                    pos = lineBegin;
                    break;
                }
                while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;
                if (pos < len) pos++;
            }
            tokens.push(strip ? LITERAL_BLOCK_STRIP : LITERAL_BLOCK, contentStart, pos);
            let p = pos;
            while (p < len && s.charCodeAt(p) === SPACE) p++;
            indent = p - pos;
            lineStart = true;

        } else { // scalar
            lineStart = false;
            let trailing = 0;

            while (pos <= len) {
                c = s.charCodeAt(pos);

                // ends with line break, comment or EOF: scalar
                if (c === BREAK || pos === len || (c === HASH && trailing > 0)) {
                    tokens.push(SCALAR, start, pos - trailing);
                    break;

                } else if (c === COLON) { // possible map key
                    c = s.charCodeAt(pos + 1);

                    if (c === SPACE || c === BREAK || pos + 1 >= len) { // ends with ": ", ":\n", or ":<EOF>"
                        handleIndents(BLOCK_MAP, indent, start); // possibly end blocks or start new one
                        tokens.push(KEY, start, start);
                        tokens.push(SCALAR, start, pos - trailing);
                        tokens.push(VALUE, pos, pos);
                        pos++;
                        break;
                    }
                }

                trailing = (c === SPACE || c === TAB) ? trailing + 1 : 0;
                pos++;
            }
        }
    }

    for (let i = 0; i < indents.length; i++) {
        tokens.push(BLOCK_END, len, len);
    }

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
            throw new Error(`Expected ${types[expectedType]}, got ${types[nextType]} at ${posToLineCol(s, tokens[i + 1])}.`);
        }
    }

    function processDoubleQuoted(qStart, qEnd) {
        let result = '';
        let j = qStart;
        while (j < qEnd) {
            if (s.charCodeAt(j) === BACKSLASH) {
                j++;
                const esc = s[j];
                if (esc === 'x') {
                    result += String.fromCharCode(parseInt(s.slice(j + 1, j + 3), 16));
                    j += 2;
                } else if (esc === 'u') {
                    result += String.fromCharCode(parseInt(s.slice(j + 1, j + 5), 16));
                    j += 4;
                } else if (esc in ESCAPES) {
                    result += ESCAPES[esc];
                } else {
                    throw new Error(`Unknown escape sequence "\\${esc}" at ${posToLineCol(s, j)}.`);
                }
            } else {
                result += s[j];
            }
            j++;
        }
        return result;
    }

    function parseLiteralBlock(lStart, lEnd, strip) {
        const lines = s.slice(lStart, lEnd).split('\n');
        if (lines.at(-1) === '') lines.pop();
        const first = lines.find(l => l.trimStart() !== '');
        const blockIndent = first ? first.search(/[^ ]/) : 0;
        const result = lines.map(l => l.slice(blockIndent)).join('\n');
        return result.replace(/\n*$/, strip ? '' : '\n');
    }

    function acceptScalar() {
        if (accept(SCALAR)) return s.slice(start, end);
        if (accept(SINGLE_QUOTED)) return s.slice(start, end).replaceAll('\'\'', '\'');
        if (accept(DOUBLE_QUOTED)) return processDoubleQuoted(start, end);
        return undefined;
    }

    function expectScalar() {
        const v = acceptScalar();
        if (v !== undefined) return v;
        throw new Error(`Expected scalar, got ${types[nextType]} at ${posToLineCol(s, tokens[i + 1])}.`);
    }

    function block() {
        const scalar = acceptScalar();
        if (scalar !== undefined) return scalar;

        if (accept(BLOCK_SEQ)) {
            const seq = [];
            while (accept(BLOCK_ENTRY)) seq.push(block() || '');
            expect(BLOCK_END);
            return seq;
        }

        if (accept(BLOCK_MAP)) {
            const map = {};
            const seen = new Set();
            while (accept(KEY)) {
                const key = expectScalar();
                if (seen.has(key)) {
                    throw new Error(`Duplicate key "${key}" at ${posToLineCol(s, start)}.`);
                }
                seen.add(key);
                expect(VALUE);
                map[key] = block() || '';
            }
            expect(BLOCK_END);
            return map;
        }

        if (accept(LITERAL_BLOCK)) return parseLiteralBlock(start, end, false);
        if (accept(LITERAL_BLOCK_STRIP)) return parseLiteralBlock(start, end, true);

        return null;
    }

    const result = block();
    expect(DOCUMENT_END);
    return result;
}

export function parse(s) {
    return parseTokens(s, tokenize(s));
}
