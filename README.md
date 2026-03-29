# yeahml

A JavaScript parser for a tiny subset of [YAML](https://yaml.org/) — a minimal amount necessary to be useful for static site generators and simple configuration, while being small, strict, fast and unambiguous. Inspired by and largely follows [StrictYAML](https://hitchdev.com/strictyaml/features-removed/) philosophy.

[![Node](https://github.com/mourner/yeahml/actions/workflows/node.yml/badge.svg)](https://github.com/mourner/yeahml/actions/workflows/node.yml) [![Simply Awesome](https://img.shields.io/badge/simply-awesome-brightgreen.svg)](https://github.com/mourner/projects)

## Key elements

- [x] Key-value pairs (maps)
- [x] Lists (sequences)
- [x] Plain, single-quoted and double-quoted string values
- [x] Multi-line string literals (`|` clip, `|-` strip, `>` folded clip, `>-` folded strip)
- [x] Comments

## No intention to support

- Implicit typing (e.g. `yes` to `true`, numbers, timestamps)
- Duplicate keys
- Flow styles (`{foo: bar, ...}`)
- Anchors and aliases (`&ref`)
- Explicit tags (`!!int`)
- Complex keys (`? foo : bar`)
- Block headers (`|+`, `|2`)
- Directives (`%YAML 1.2`)
- Non-UTF-8 encodings
