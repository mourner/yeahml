
exports.parse = parse;

const BREAK = 10;
const SPACE = 32;
const HASH = 35;
const HYPHEN = 45;
const COLON = 58;

const INDENT = 1;
const MAP = 2;
const VAL = 3;

const types = {
    [INDENT]: 'indent',
    [MAP]: 'map',
    [VAL]: 'value'
};

function parse(s) {
    let pos = 0;
    const tokens = [];
    const len = s.length;

    while (pos < len) {
        const start = pos;
        let type;
        let c = s.charCodeAt(pos++);

        if (c === HASH) {
            while (pos < len && s.charCodeAt(pos) !== BREAK) pos++;
            continue;

        } else if (c === BREAK) {
            while (pos < len && s.charCodeAt(pos) === SPACE) pos++;
            type = INDENT;

        } else if (c === SPACE) {
            while (pos < len && s.charCodeAt(pos) === SPACE) pos++;
            continue;

        } else if (c === COLON && pos < len) {
            c = s.charCodeAt(pos);
            if (c === SPACE || c === BREAK) type = MAP;
        }

        if (!type) {
            while (pos < len) {
                c = s.charCodeAt(pos);
                if (c === BREAK) {
                    break;

                } else if (c === COLON) {
                    c = s.charCodeAt(pos + 1);
                    if (c === SPACE || c === BREAK) break;

                } else if (c === SPACE) {
                    if (s.charCodeAt(pos + 1) === HASH) break;
                }
                pos++;
            }
            type = VAL;
        }

        tokens.push(type, start, pos);
    }

    let i = 0;
    let nextType = tokens[0];
    let start, end;
    let indent = 0;

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

    function updateIndent() {
        indent = end - start - 1;
    }

    function expect(expectedType) {
        if (!accept(expectedType)) throw new Error(`Expected ${types[expectedType]}, got ${types[nextType]}.`);
    }

    function block(expectedIndent) {
        const map = {};

        while (i < tokens.length && indent === expectedIndent) {
            expect(VAL);
            const key = s.slice(start, end);
            expect(MAP);

            if (accept(VAL)) {
                map[key] = s.slice(start, end);

                if (i < tokens.length) {
                    expect(INDENT);
                    updateIndent();
                }

            } else {
                expect(INDENT);
                updateIndent();

                if (indent > expectedIndent) {
                    map[key] = block(indent);

                } else {
                    map[key] = '';
                }
            }
        }
        if (i < tokens.length && indent > expectedIndent)
            throw new Error(`Unexpected indent: ${indent}.`);

        return map;
    }

    accept(INDENT);
    updateIndent();
    return block(indent);
}
