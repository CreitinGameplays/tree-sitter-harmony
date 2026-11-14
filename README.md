# Harmony Tree-sitter grammar implementation

This folder contains a first concrete Tree-sitter grammar based on Harmony
v0.3.3 §18 (Formal grammar / EBNF).

## Files

- `grammar.js` — syntax grammar for declarations, types, statements, patterns,
  expressions, literals, and operators.
- `src/scanner.c` — nested block-comment scanner (`/* ... /* ... */ ... */`).
- `queries/highlights.scm` — Zed/Tree-sitter highlighting query written against
  the node names and fields in this grammar.

## Install into the existing `tree-sitter-harmony` repository

From the root of that repository, back up your current files and copy these:

```sh
cp grammar.js grammar.js.before-harmony-grammar
cp queries/highlights.scm queries/highlights.scm.before-harmony
cp /path/to/this-folder/grammar.js ./grammar.js
cp /path/to/this-folder/src/scanner.c ./src/scanner.c
cp /path/to/this-folder/queries/highlights.scm ./queries/highlights.scm
```

Keep the existing `tree-sitter.json`: it already points at
`queries/highlights.scm`.

## Generate and test

```sh
tree-sitter generate
tree-sitter parse -p . /tmp/min.harmony
tree-sitter parse -p . /tmp/test.harmony
tree-sitter query --grammar-path . queries/highlights.scm /tmp/test.harmony
# Run this too if the repository has a test/corpus/ directory:
tree-sitter test
```

`/tmp/min.harmony` should contain:

```harmony
fn main() {}
```

The query should no longer report `doc_comment` as an invalid node type because
`doc_comment`, `line_comment`, and `block_comment` are explicitly present in the
grammar.

## Scope and known limits

This is a parser grammar, not the Harmony compiler. It does not implement
ownership checking, borrowing, lifetime validation, type inference, numeric
checking, switch exhaustiveness, or the other semantic analyses described in
the design document. Those belong in later compiler passes.

The grammar follows the v0.3.3 EBNF in §18. It does not silently add the v1
extensions described in §20.3 (for example guarded `case` arms or function
pointer types). A few context-sensitive restrictions from the EBNF are not
representable in a context-free Tree-sitter grammar and must be checked
semantically. Tree-sitter generation and parsing should be run in the target
repository before treating this as production-ready; this artifact has not
been compiled with the user's installed CLI in this environment.
