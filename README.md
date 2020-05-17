# yeahml

A tiny subset of YAML — a minimal amount necessary to be useful for static site generators and simple configuration. _Highly experimental and a work in progress_.

## Elements

- [x] Key-value pairs (maps)
- [ ] Lists (sequences)
- [x] Plain string values
- [ ] Single-quoted string values
- [ ] Double-quoted string values
- [ ] Multi-line string literals

## No intention to support

- Complex keys (`? foo : bar`)
- Implicit typing (e.g. `yes` to `true`, timestamps)
- Anchors and aliases (`&ref`)
- Explicit tags (`!!int`)
- Flow styles (`{foo: bar, ...})
