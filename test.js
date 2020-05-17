
const {test} = require('tape');
const {parse} = require('./index.js');

test('basic', (t) => {
    const yaml = `
hello:
  oneasd:
    foo:
    baz: ff
    bar: baz
two: 20
mapping:
  sky: blue
  big sea: green`;

    t.same(parse(yaml), {
        hello: {
            oneasd: {
                foo: '',
                baz: 'ff',
                bar: 'baz'
            }
        },
        two: '20',
        mapping: {
            sky: 'blue',
            'big sea': 'green'
        }
    });

    t.end();
});
