# yeahml

A JavaScript parser for a tiny subset of [YAML](https://yaml.org/) — a minimal amount necessary to be useful for static site generators and simple configuration, while being small, strict and unambiguous. Inspired by [StrictYAML](https://github.com/crdoconnor/strictyaml). _Experimental and a work in progress_.

## Key elements

- [x] Key-value pairs (maps)
- [ ] Lists (sequences)
- [x] Plain string values
- [ ] Single-quoted string values
- [ ] Double-quoted string values
- [ ] Multi-line string literals
- [x] Comments

## No intention to support

- Flow styles (`{foo: bar, ...}`)
- Anchors and aliases (`&ref`)
- Explicit tags (`!!int`)
- Implicit typing (e.g. `yes` to `true`, timestamps)
- Complex keys (`? foo : bar`)
- Block headers (`|+`)
- Folded scalars (`>`)
- Directives (`%YAML 1.2`)
- Non-UTF-8 encodings
