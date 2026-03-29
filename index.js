const BREAK = 10;
const TAB = 9;
const SPACE = 32;
const HASH = 35;
const PERCENT = 37;
const HYPHEN = 45;
const PERIOD = 46;
const COLON = 58;
const GREATER = 62;
const QUOTE_DOUBLE = 34;
const QUOTE_SINGLE = 39;
const PLUS = 43;
const BACKSLASH = 92;
const PIPE = 124;

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
const FOLDED_BLOCK = 12;
const FOLDED_BLOCK_STRIP = 13;
const LITERAL_BLOCK_KEEP = 14;
const FOLDED_BLOCK_KEEP = 15;

const types = [
    'scalar', 'mapping', 'key', 'value', 'sequence', 'sequence entry', 'block end', 'document end', 'quoted scalar',
    'quoted scalar', 'literal block', 'literal block', 'folded block', 'folded block', 'literal block', 'folded block'
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
    '\t': '\t'  // backslash + literal tab → tab
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
    let seqCompact = false; // true when a block scalar immediately follows "- " (compact notation)

    // Returns true if the next two chars equal c and are followed by whitespace or EOF.
    const isTriple = c => s.charCodeAt(pos) === c && s.charCodeAt(pos + 1) === c &&
        (pos + 2 >= len || s.charCodeAt(pos + 2) === BREAK || s.charCodeAt(pos + 2) === SPACE || s.charCodeAt(pos + 2) === TAB);

    // Returns true if pos points to a valid block scalar header (optional -/+, optional comment, then newline).
    const isBlockScalarHeader = (p) => {
        if (s.charCodeAt(p) === HYPHEN || s.charCodeAt(p) === PLUS) p++;
        while (p < len && s.charCodeAt(p) === SPACE) p++;
        if (p < len && s.charCodeAt(p) === HASH) while (p < len && s.charCodeAt(p) !== BREAK) p++;
        return p >= len || s.charCodeAt(p) === BREAK;
    };

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

        if (c === HASH || (lineStart && c === PERCENT)) { // comment or directive: skip to end of line
            while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;

        } else if (c === BREAK) { // line break; reset indent
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
            seqCompact = false;

        } else if (c === SPACE || c === TAB) { // spaces/tabs; skip
            while (pos < len && (s.charCodeAt(pos) === SPACE || s.charCodeAt(pos) === TAB)) pos++;

        } else if (lineStart && isTriple(HYPHEN)) { // "---": document separator, skip
            pos += 2;

        } else if (lineStart && isTriple(PERIOD)) { // "...": document end marker
            break;

        } else if (c === HYPHEN && (s.charCodeAt(pos) === SPACE || s.charCodeAt(pos) === TAB || pos >= len)) { // "- ": sequence entry
            lineStart = false;
            if (pos < len) pos++; // past the space/tab (not present at EOF)
            indent++; // treat sequence entry as indented to support nested sequence on the same indentation
            handleIndents(BLOCK_SEQ, indent, start);
            tokens.push(BLOCK_ENTRY, start, start);
            indent++; // treat following tokens as indented for compact notation
            seqCompact = true;

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
                const nlPos = s.indexOf('\n', contentStart);
                if (nlPos !== -1 && nlPos < contentEnd) {
                    throw new Error(`Multi-line implicit key at ${posToLineCol(s, start)}.`);
                }
                handleIndents(BLOCK_MAP, indent, start);
                tokens.push(KEY, start, start);
                tokens.push(tokenType, contentStart, contentEnd);
                tokens.push(VALUE, afterClose, afterClose);
                pos = afterClose + 1;
                seqCompact = false;
            } else {
                tokens.push(tokenType, contentStart, contentEnd);
            }

        } else if ((c === PIPE || c === GREATER) && isBlockScalarHeader(pos)) { // block scalar (literal | or folded >)
            lineStart = false;
            const folded = c === GREATER;
            const strip = s.charCodeAt(pos) === HYPHEN;
            const keep = s.charCodeAt(pos) === PLUS;
            const blockLevel = seqCompact ? indent - 2 : indent; // compact seq entries: blockLevel = raw position of '-'
            seqCompact = false;
            if (strip || keep) pos++;
            while (pos < len && s.charCodeAt(pos) === SPACE) pos++;
            if (pos < len && s.charCodeAt(pos) === HASH) while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;
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
                    if (lineIndent <= blockLevel) { pos = lineBegin; break; } // empty block
                    blockIndent = lineIndent;
                } else if (lineIndent < blockIndent) { // end of block
                    pos = lineBegin;
                    break;
                }
                while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;
                if (pos < len) pos++;
            }

            // map (folded, strip/keep) → token type
            const blockType = folded ?
                (strip ? FOLDED_BLOCK_STRIP : keep ? FOLDED_BLOCK_KEEP : FOLDED_BLOCK) :
                (strip ? LITERAL_BLOCK_STRIP : keep ? LITERAL_BLOCK_KEEP : LITERAL_BLOCK);
            tokens.push(blockType, contentStart, pos);

            let p = pos;
            while (p < len && s.charCodeAt(p) === SPACE) p++;
            indent = p - pos;
            lineStart = true;

        } else { // scalar
            lineStart = false;
            let trailing = 0;

            while (pos <= len) {
                c = s.charCodeAt(pos);

                if (c === BREAK || pos === len || (c === HASH && trailing > 0)) { // end of scalar
                    tokens.push(SCALAR, start, pos - trailing);
                    break;

                } else if (c === COLON) { // possible map key
                    c = s.charCodeAt(pos + 1);
                    if (c === SPACE || c === TAB || c === BREAK || pos + 1 >= len) {
                        handleIndents(BLOCK_MAP, indent, start);
                        tokens.push(KEY, start, start);
                        tokens.push(SCALAR, start, pos - trailing);
                        tokens.push(VALUE, pos, pos);
                        pos++;
                        seqCompact = false;
                        break;
                    }
                }

                trailing = (c === SPACE || c === TAB) ? trailing + 1 : 0;
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
            throw new Error(`Expected ${types[expectedType]}, got ${types[nextType]} at ${posToLineCol(s, tokens[i + 1])}.`);
        }
    }

    // Fold a line break in a quoted scalar: blank lines become literal newlines, otherwise a single space.
    function foldBreak(j, qEnd) {
        let blanks = 0;
        while (j < qEnd) {
            while (j < qEnd && (s.charCodeAt(j) === SPACE || s.charCodeAt(j) === TAB)) j++;
            if (j < qEnd && s.charCodeAt(j) === BREAK) { blanks++; j++; } else break;
        }
        return {text: blanks > 0 ? '\n'.repeat(blanks) : ' ', j};
    }

    function processSingleQuoted(qStart, qEnd) {
        let result = '';
        let j = qStart;
        while (j < qEnd) {
            const c = s.charCodeAt(j);
            if (c === QUOTE_SINGLE) {
                result += '\'';
                j += 2;
            } else if (c === BREAK) {
                result = result.replace(/[ \t]+$/, '');
                const folded = foldBreak(j + 1, qEnd);
                result += folded.text;
                j = folded.j;
            } else {
                result += s[j++];
            }
        }
        return result;
    }

    function processDoubleQuoted(qStart, qEnd) {
        let result = '';
        let j = qStart;
        let rawTrailing = 0; // tracks literal (non-escape-produced) trailing whitespace for fold stripping

        while (j < qEnd) {
            if (s.charCodeAt(j) === BACKSLASH) {
                rawTrailing = 0; // escape sequences reset trailing whitespace tracking
                j++;
                const esc = s[j];
                if (esc === 'x') {
                    result += String.fromCharCode(parseInt(s.slice(j + 1, j + 3), 16));
                    j += 2;
                } else if (esc === 'u') {
                    result += String.fromCharCode(parseInt(s.slice(j + 1, j + 5), 16));
                    j += 4;
                } else if (s.charCodeAt(j) === BREAK) { // escaped newline: discard newline and following indent
                    j++;
                    while (j < qEnd && (s.charCodeAt(j) === SPACE || s.charCodeAt(j) === TAB)) j++;
                    continue;
                } else if (esc in ESCAPES) {
                    result += ESCAPES[esc];
                } else {
                    throw new Error(`Unknown escape sequence "\\${esc}" at ${posToLineCol(s, j)}.`);
                }

            } else if (s.charCodeAt(j) === BREAK) {
                result = result.slice(0, result.length - rawTrailing); // strip only literal trailing whitespace
                rawTrailing = 0;
                const folded = foldBreak(j + 1, qEnd);
                result += folded.text;
                j = folded.j;
                continue;

            } else {
                const c = s.charCodeAt(j);
                result += s[j];
                rawTrailing = (c === SPACE || c === TAB) ? rawTrailing + 1 : 0;
            }
            j++;
        }
        return result;
    }

    // Shared setup for both block scalar parsers: split lines, compute indent, handle keep-mode trailing blanks.
    function blockLines(lStart, lEnd, keep) {
        const lines = s.slice(lStart, lEnd).split('\n');
        if (lines.at(-1) === '') lines.pop();
        const first = lines.find(l => l.replace(/^ */, '') !== ''); // first line with non-space content
        const blockIndent = first ? first.search(/[^ ]/) : 0;
        let trailingBlanks = 0;
        if (keep && !first) {
            trailingBlanks = lines.length; // no content: all lines are trailing blanks
            lines.length = 0;
        } else if (keep) {
            while (lines.length > 0 && lines.at(-1).slice(blockIndent) === '') {
                trailingBlanks++;
                lines.pop();
            }
        }
        return {lines, blockIndent, trailingBlanks, first};
    }

    function parseLiteralBlock(lStart, lEnd, strip, keep) {
        const {lines, blockIndent, trailingBlanks, first} = blockLines(lStart, lEnd, keep);
        const result = lines.map(l => l.slice(blockIndent)).join('\n');
        if (keep) return result + '\n'.repeat(trailingBlanks + (lines.length > 0 ? 1 : 0));
        if (!first) return '';
        return result.replace(/\n*$/, strip ? '' : '\n');
    }

    function parseFoldedBlock(lStart, lEnd, strip, keep) {
        const {lines, blockIndent, trailingBlanks, first} = blockLines(lStart, lEnd, keep);
        let result = '';
        let prevType = null; // null | 'regular' | 'blank' | 'indented'
        for (const rawLine of lines) {
            const line = rawLine.slice(blockIndent);
            if (line === '') {
                result += '\n';
                prevType = 'blank';
            } else if (line[0] === ' ') {
                if (prevType !== null && prevType !== 'blank') result += '\n';
                result += line;
                prevType = 'indented';
            } else {
                if (prevType === 'regular') result += ' ';
                else if (prevType === 'indented') result += '\n';
                result += line;
                prevType = 'regular';
            }
        }
        if (keep) return result + '\n'.repeat(trailingBlanks + (lines.length > 0 ? 1 : 0));
        if (!first) return '';
        return result.replace(/\n*$/, strip ? '' : '\n');
    }

    function acceptScalar() {
        if (accept(SCALAR)) return s.slice(start, end);
        if (accept(SINGLE_QUOTED)) return processSingleQuoted(start, end);
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
                if (seen.has(key)) throw new Error(`Duplicate key "${key}" at ${posToLineCol(s, start)}.`);
                seen.add(key);
                expect(VALUE);
                map[key] = block() || '';
            }
            expect(BLOCK_END);
            return map;
        }

        if (accept(LITERAL_BLOCK)) return parseLiteralBlock(start, end, false, false);
        if (accept(LITERAL_BLOCK_STRIP)) return parseLiteralBlock(start, end, true, false);
        if (accept(LITERAL_BLOCK_KEEP)) return parseLiteralBlock(start, end, false, true);
        if (accept(FOLDED_BLOCK)) return parseFoldedBlock(start, end, false, false);
        if (accept(FOLDED_BLOCK_STRIP)) return parseFoldedBlock(start, end, true, false);
        if (accept(FOLDED_BLOCK_KEEP)) return parseFoldedBlock(start, end, false, true);

        return null;
    }

    const result = block();
    expect(DOCUMENT_END);
    return result;
}

export function parse(s) {
    return parseTokens(s, tokenize(s));
}
