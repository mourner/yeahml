# yeahml

A JavaScript parser for a tiny subset of [YAML](https://yaml.org/) — a minimal amount necessary to be useful for static site generators and simple configuration, while being small, strict and unambiguous. Inspired by [StrictYAML](https://github.com/crdoconnor/strictyaml). _Experimental and a work in progress_.

## Key elements

- [x] Key-value pairs (maps)
- [x] Lists (sequences)
- [x] Plain string values
- [x] Single-quoted string values
- [x] Double-quoted string values
- [x] Multi-line string literals (`|` clip, `|-` strip)
- [x] Comments

## No intention to support

- Implicit typing (e.g. `yes` to `true`, numbers, timestamps)
- Duplicate keys
- Flow styles (`{foo: bar, ...}`)
- Anchors and aliases (`&ref`)
- Explicit tags (`!!int`)
- Complex keys (`? foo : bar`)
- Block headers (`|+`)
- Folded scalars (`>`)
- Directives (`%YAML 1.2`)
- Non-UTF-8 encodings
