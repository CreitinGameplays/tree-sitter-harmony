# Harmony — A C-Like, Beginner-Friendly, Memory-Safe Systems Language

File extension: `.harmony`

### Conceptual Design Document · v0.3.3

> **Status:** conceptual. Nothing here is implemented, benchmarked, or proven sound.
> The language is **Harmony**; source files end in `.harmony`. This document
> says "the language" and "the compiler" where a neutral voice reads better.
> Examples keep the compiler binary name `lc` for brevity — in this
> codebase the driver is `harmony-base` (the bootstrap compiler, written in
> c2x-seed).
>
> Placeholders used in some older examples: `.src` file suffixes read as
> `.harmony`.

---

## Contents

1. [Changelog and vocabulary map](#1-changelog-and-vocabulary-map)
2. [Goals, non-goals, and the feature budget](#2-goals-non-goals-and-the-feature-budget)
3. [The rules](#3-the-rules)
4. [Lexical structure](#4-lexical-structure)
5. [Types](#5-types)
6. [Declarations](#6-declarations)
7. [Expressions and operators](#7-expressions-and-operators)
8. [Statements and control flow](#8-statements-and-control-flow)
9. [Ownership and moves](#9-ownership-and-moves)
10. [Borrowing](#10-borrowing)
11. [Lifetimes: `life`](#11-lifetimes-life)
12. [The heap, `heap(...)`, and `cleanup`](#12-the-heap-heap-and-cleanup)
13. [`unchecked`: taking the seatbelt off on purpose](#13-unchecked-taking-the-seatbelt-off-on-purpose)
14. [Runtime traps and error values](#14-runtime-traps-and-error-values)
15. [Standard library surface](#15-standard-library-surface)
16. [Compiler diagnostics format](#16-compiler-diagnostics-format)
17. [Example programs](#17-example-programs)
18. [Formal grammar (EBNF)](#18-formal-grammar-ebnf)
19. [Compiler architecture and the backends](#19-compiler-architecture-and-the-backends)
20. [Limitations, open questions, roadmap](#20-limitations-open-questions-roadmap)
21. [Appendix: C to this language cheat sheet](#21-appendix-c-to-this-language-cheat-sheet)

---

## 1. Changelog and vocabulary map

### 1.1 Version history

| Version | Theme | What changed |
|---|---|---|
| v0.1 | First draft | Ownership core, `life(a)` lifetime syntax, `new`, C-style parens and semicolons. |
| v0.2 | Rename pass | `impl`→`methods`, `match`→`switch`/`case`, `Option`/`Some`/`None`→`Maybe`/`Has`/`Empty`, `Box`→`Heap`, `for (x in v)`→`for (x : v)`. |
| v0.3 | Identity pass | New diagnostics format, `String::from`→`.own()`, constructors named `make`, `unchecked("reason")`, `raw` pointers, `extern "C" fn`, `export`/`import`, `cleanup` hook, `eq`/`ord` bounds, `next` iteration protocol, `Outcome`, byte literals, ranges. |
| v0.3.1 | Decisions + backends | §20.3 open questions resolved (structured reasons, guards, `Shared<T>`, threads incl. detached, `try`, named fields/struct patterns, function pointers, `i32` literals; `unchecked`-as-expression rejected); names kept, trait-like feature renamed **`trait`→`abilities`**, `spawn`/`send` un-reserved; **LLVM is the primary backend**, C11 secondary; the language is named Harmony (`.harmony`). |
| v0.3.2 | Heap form | The heap keyword `new` (a prefix operator: `new 42`) is replaced by the `sizeof`-styled built-in form **`heap(x)`**. It reads like the allocation it is, cannot be mistaken for a constructor, and lets the compiler construct the value **in place** (`heap([0u8; 8_000_000])`). `new` and `delete` join the recognized foreign words. |
| v0.3.3 | Split rule | §19.8 makes the compiler-vs-library boundary explicit: the compiler keeps only what soundness or syntax requires (analyses, traps, indexing, `heap(x)`, about a dozen intrinsics). Types, collections, formatting, I/O, the runtime's entry/allocator/trap formatting, protocol implementations, diagnostic wording, and lints all move to the library or tooling. |
| impl | M1 in harmony-base | The bootstrap compiler now **runs the language**: lexer → parser → type checker → LLVM IR text → clang + freestanding runtime → executable. Checked arithmetic (T-OVERFLOW), division/shift traps (T-DIV0, T-SHIFT), bounds-checked indexing (T-INDEX), `heap(x)` allocation, structs/enums by value (sret), methods with `Type__method` mangling, `switch` on scalars and enums, and references all work under `run` with trap status 70 (§14.3). `emit-llvm` output is byte-deterministic. |
| impl (rewrite) | R7 driver and self-host | `build/harmony` is built by harmony-base, then rebuilt by itself so every canonical stage uses the same native backend schedule. Stage 2 and stage 3 are byte-identical to stage 1. `build`/`run`/`check`/`emit-llvm`/`explain`/`audit` have a differential smoke gate. |
| impl (rewrite) | R8 native LLVM-C backend | `build`/`run` now link against `libLLVM` directly through `extern "C"` bindings (`library/std/llvm.hr`) and emit objects in parallel without spawning clang. `--backend=clang` keeps the old text/IR path for debugging, and `emit-llvm` is unchanged. |
| impl (rewrite) | v1 batch 1 | The final compiler accepts structured `unchecked(tag, "reason")` forms, guarded `switch` arms, and `Shared<T>`/`Weak<T>` from `library/std/shared.hr`. Audit reports tags; guards see bindings; shared ownership uses a control block with explicit `release` and `Maybe`-returning `upgrade`. These forms are final-language only; harmony-base stays v0. |
| impl (rewrite) | v1 threads | `library/std/thread.hr` adds joined and detached threads over raw `clone(2)` + futex hooks in `library/runtime/rt.c`. The `Share<T>` capability marker mints an opaque `ThreadArg` that `spawn` requires; `fnptr(f)` is the small final-only intrinsic for a function address. All three v1 gates pass; harmony-base stays v0. |
| impl (rewrite) | v1 `else` clause | The final compiler accepts `let x = f() else return;`, `else (e) { ... };`, `else continue;`, `else break;` and `else trap(...);` on `let`, plain `=` assignment, and expression statements. `try` is not a keyword; the success payload binds the target, `else return` forwards `Bad(e)`/`Empty`, and FLOW-01/02/03 reject fallthrough, mismatched errors, and impossible forwarding. These forms are final-language only; harmony-base stays v0. |
| impl (rewrite) | v1 patterns | The final compiler accepts named enum payload fields (`Variant { name: Type }`), named construction (`Enum::Variant { .name = value }`, positional still works), and struct patterns in `switch` (`case Point { x: 0, y: y }:`) with literal tests, bindings, qualified names and guards. Unknown fields are `TYPE-02`; a struct pattern on a non-struct/enum subject is `TYPE-01`. |
| impl (rewrite) | v1 function pointers | The final compiler accepts the structural `fn(Params) -> Ret` type. A declared function name used as a value produces a function pointer (annotation optional); signatures must match (`TYPE-01`) and indirect calls check arity (`TYPE-04`) and argument types. Pointers are `copy` and work in locals, fields, arrays and return positions. The separate `fnptr(name)` intrinsic still supplies opaque thread-entry addresses. |
| design (future) | §20.5 scoped AST macros | Documented the intended v2 macro system: expansion at stage 3.5, `#name(...)` calls, `expr`/`code`/`block`/`type`/`ident` parameter kinds, hygienic scopes, scoped `return`, variadic packs, `MACRO-01..04`, and the grammar extension. **Design only — no implementation, not in v1.** |
| impl (rewrite) | R6 LLVM backend | The self-hosted compiler now has its own LLVM IR emitter (`harmony/codegen/llvm/`). On all 95 programs in the codegen corpus, its IR is **byte-identical** to harmony-base's, including checked arithmetic, traps, slices, aggregates, generics, methods, enums, switches, formatting calls, and multi-module programs. |

### 1.2 Bug fixed in v0.3

v0.2 used `new` as the heap-allocation keyword (`new 42`) **and** as the conventional constructor name (`Counter::new()`). Those cannot both parse, so v0.3 made constructors `Type::make()` and kept `new` as the heap keyword. v0.3.2 removes that obligation entirely: the heap form is `heap(x)`, so `new` is no longer a keyword at all (writing it earns a `NAME-02` hint).

### 1.3 Vocabulary map

The core ideas (ownership, borrowing, lifetimes, exhaustive sum types) are not new; the surface is chosen to feel like C. This table maps the vocabulary so reviewers can see exactly what was changed and why.

| Idea | Common name elsewhere | Here | Why |
|---|---|---|---|
| Method block | `impl` | `methods Type { ... }` | Says what it is. |
| Pattern branching | `match` | `switch (x) { case P: { ... } }` | C-heads know it; ours is exhaustive with no fallthrough. |
| Optional value | `Option` / `Some` / `None` | `Maybe<T>` / `Has(x)` / `Empty` | Reads like English. |
| Fallible value | `Result` / `Ok` / `Err` | `Outcome<T, E>` / `Good(x)` / `Bad(e)` | Same. |
| Owning heap pointer | `Box<T>` | `Heap<T>` | "This lives on the heap." |
| Lifetime declare | `<'a>` | `<life a>` | No dangling `'`. |
| Lifetime use | `&'a T` | `&life(a) T` | Looks like `sizeof(x)`. |
| Whole-program lifetime | `'static` | `life(static)` | Same shape. |
| Escape hatch | `unsafe { }` | `unchecked("reason") { }` | Mandatory, auditable justification. |
| Raw pointer | `*const T` / `*mut T` | `raw T` / `raw mut T` | Keeps `*` for deref only. |
| Visibility | `pub` | `export` | Pairs with `import`. |
| Import | `use` | `import "path";` | C-like. |
| Abort | `panic!` | `trap(msg)` | A trap is a controlled stop, not an exception. |
| Force-unwrap | `.unwrap()` | `.or_trap("msg")` | The name says what happens. |
| Borrowed→owned | `String::from(s)` / `.to_string()` | `"Ada".own()` | One verb for "make me an owned copy". |
| Constructor convention | `Type::new()` | `Type::make()` | A constructor is a named `make`, not a keyword. |
| Heap allocation | `new x` / `Box::new(x)` | `heap(x)` | A built-in form, C-`sizeof` styled; `new` is a foreign word. |
| Destructor | `Drop` trait | `fn cleanup(&mut self)` | A special method name, no traits needed. |
| Iteration | `Iterator` trait | any type with `fn next(&mut self) -> Maybe<T>` | A structural protocol, no traits needed. |
| Traits (v1) | `trait` | `abilities` | An ability is what a type *has*; the bound syntax `<T: Drawable>` is already the shape. |
| Infinite loop | `loop {}` | `while (true) { }` | Already C. |
| Swap / replace / take | `mem::swap` etc. | `swap`, `replace`, `.take()` | Free functions in the prelude. |
| Compiler errors | `error[E0382]: ...` + carets | "Life story" timeline (see §16) | Teaches ownership by narrating it. |

### 1.4 What stayed the same on purpose

`let`, `let mut`, `&`, `&mut`, `*` (deref), `fn`, `struct`, `enum`, `const`, `copy` (marker), `Vec`, `String`, `str`, and `::` for paths. Familiar where familiarity is free, renamed where a rename improves reading.

---

## 2. Goals, non-goals, and the feature budget

### 2.1 Goals

1. **Memory safe by construction.** In code that does not use `unchecked`, there is no use-after-free, double free, dangling reference, buffer overflow, null dereference, uninitialized read, iterator invalidation, or type confusion.
2. **No garbage collector, no reference counting by default.** Memory is freed at a statically known point: the closing `}` of the owner's scope.
3. **C-shaped.** Parenthesized conditions, mandatory braces, semicolons, `switch`, `for (;;)`, designated initializers, explicit `return`. A C programmer can read a page of it on day one.
4. **Beginner-friendly.** Few concepts, readable keywords, diagnostics that explain in plain English and always propose a fix.
5. **Predictable.** Defined evaluation order (left to right), no integer promotion surprises, no implicit casts, no undefined behavior outside `unchecked`.
6. **The primary backend is LLVM**, so safe code compiles to native quality with checked arithmetic and bounds checks inline (`--emit=llvm`, then assemble + link; `--emit=c` emits C11 as a portable secondary backend that runs anywhere a C compiler does).

### 2.2 Non-goals (v0)

- Maximum expressiveness. There are no user-defined abilities (traits), closures, macros, or operator overloading in v0. (`abilities` arrives in v1.)
- Zero-cost *everything*. Bounds checks and overflow checks exist and are on in all builds.
- Leak freedom. Memory safety is not leak safety (see §3.4).
- Concurrency. v0 is single-threaded; v1 adds threads **with detached-thread support** via capability markers that are ordinary names, not reserved keywords (§20.3 item 4, §20.4).
- Source compatibility with C. It is C-*shaped*, not C-compatible, apart from `extern "C" fn` FFI.

### 2.3 The feature budget

Every feature in v0 must kill a named bug class. If it doesn't, it is out.

| Feature | Bug class it kills |
|---|---|
| Single ownership and moves | double free, use-after-free |
| Scope-end drop | leaks, manual `free()` |
| `&` / `&mut` exclusivity | aliased mutation, iterator invalidation, data corruption |
| `life` plus elision | dangling pointers |
| `Maybe<T>`, no null | null dereference |
| Definite initialization | uninitialized reads |
| Bounds-checked indexing, trapping overflow | buffer overflow, silent wraparound |
| Exhaustive, no-fallthrough `switch` | forgotten cases, fallthrough bugs |
| Explicit-only conversions | implicit-promotion and sign bugs |
| Left-to-right evaluation | unspecified-order bugs |
| `unchecked("reason")` | *makes the remaining risk searchable* |

The budget also cuts the other way: anything that does **not** kill a bug
class does not belong in the compiler either. Where the safe subset ends and
ordinary library code begins is spelled out in the **split rule** (§19.8).

---

## 3. The rules

### 3.1 The five core rules

1. **Every value has exactly one owner.**
2. **When the owner goes out of scope, the value is freed at the closing `}`.** No GC, no `free()`. (`free()` has been let go, effective immediately.)
3. **Passing or assigning by value moves it,** unless the type is marked `copy`.
4. **You can have many `&` or one `&mut`, never both, while they are alive.**
5. **A reference can't outlive what it points to.** That is what `life` is for.

### 3.2 Guarantees that fall out of the rules

- No null. Absence is `Maybe<T>`.
- No reads of uninitialized variables (definite-initialization analysis).
- Array, slice, and `Vec` indexing are bounds-checked (`str` is reached through `s.as_bytes()[i]` or a `&s[lo..hi]` range, also checked).
- Integer overflow, divide-by-zero, and over-wide shifts **trap** in every build mode.
- No pointer arithmetic, no raw pointers, no unions, no implicit casts, **outside `unchecked`**.
- Borrows are liveness-based (non-lexical): a borrow ends at its **last use**, not at the `}`.
- Argument and operand evaluation order is strictly left to right.

### 3.3 The C-head rules

- Conditions in `if`, `while`, `for`, and `switch` need parentheses.
- Braces are always mandatory (goodbye, goto-fail).
- Every simple statement ends with `;`.
- Assignment is a **statement**, not an expression, so `if (x = 5)` cannot compile.
- `if` / `switch` are statements, not expressions. There is no ternary and no trailing-expression magic: values leave a function with an explicit `return`.
- No `++` / `--`; write `i += 1;`.
- `switch` has no fallthrough, so Duff's device has left the chat. Every `switch` must be exhaustive.
- `break` inside a `switch` exits the enclosing **loop** (the `switch` itself never needs `break`).
- Conditions must be `bool`. `if (n)` with an integer `n` is a type error.
- `!` is logical-not on `bool` only; bitwise-not is `~`.

### 3.4 What "memory safe" does and doesn't mean

**Excluded outside `unchecked`:** use-after-free, double free, invalid free, dangling references, out-of-bounds access, null dereference, uninitialized reads, type confusion, iterator invalidation, stack overflow as undefined behavior (it becomes a trap).

**Still possible, by design:**

| Thing | Status |
|---|---|
| Logic bugs | Always. The compiler is not a mind reader. |
| Traps (bounds, overflow, `/0`, `or_trap`, `assert`) | Defined behavior: a controlled stop with a message. |
| Out-of-memory | A trap, never undefined behavior. |
| Leaks | Possible only through `leak(x)` or `unchecked` code. There is no shared ownership in v0, so reference cycles cannot be built. |
| Undefined behavior | Possible **only** if an `unchecked` contract is violated (see §13.6). |

---

## 4. Lexical structure

### 4.1 Source text

- UTF-8, LF or CRLF line endings. Tabs and spaces are whitespace. Indentation is not significant.
- Comments: `// to end of line`, `/* block */` (**block comments nest**, so commenting out code that contains a block comment works), and `/// doc comment` attached to the next item.
- Identifiers: `[A-Za-z_][A-Za-z0-9_]*`. Convention (a style lint, not an error): `snake_case` for functions and variables, `PascalCase` for types, `SCREAMING_SNAKE` for constants.

### 4.2 Keywords

| Group | Keywords |
|---|---|
| Declarations | `fn` `let` `mut` `const` `struct` `enum` `methods` `copy` `export` `import` `extern` |
| Control flow | `if` `else` `while` `for` `switch` `case` `default` `return` `break` `continue` |
| Memory and safety | `unchecked` `raw` `self` |
| Literals and operators | `true` `false` `as` `sizeof` `heap` |
| **Contextual** (keyword only in the positions listed) | `life` — only in generic lists (`<life a>`) and in types (`&life(a) T`, `Words<life(a)>`); `expr` `code` `block` `type` `ident` — only as macro parameter kinds (§20.5) |

`life` is **contextual**, so `player.life -= 1;` still compiles. (A game developer's most-typed identifier survives.) The five macro parameter-kind words are contextual too: they are ordinary identifiers everywhere except after the `:` in a macro parameter list.

**Reserved for the future:** `abilities` `async` `await` `macro`. (`try` was dropped from the list in v1: early exit is an `else` clause, not a keyword — §20.3 item 5. `macro` stays reserved for the scoped AST macro design in §20.5, which is **not** in v1.)
(`trait` is **not** reserved — the v1 trait-like feature is spelled
`abilities`, see §20.4. `spawn` and `send` are deliberately **not** reserved
either — v1 concurrency will use ordinary method-style names, not keywords;
see §20.4.)

**Recognized foreign words** (not keywords, but the compiler knows them and gives a translation hint instead of a bare "unknown name"; see `NAME-02` in §16): `unsafe` `impl` `match` `trait` `pub` `use` `loop` `goto` `null` `NULL` `nullptr` `malloc` `free` `new` `delete` `Box` `Option` `Some` `None` `Result` `Ok` `Err` `panic`, plus the preprocessor/macro spellings `define` (as `#define`) and `macro_rules` (as `macro_rules!`) — §16.11, §20.5.

### 4.3 Literals

| Kind | Examples | Notes |
|---|---|---|
| Integer | `42`, `1_000_000`, `0xFF`, `0o17`, `0b1010` | Suffix selects type: `42u8`, `7i64`, `9usize`. Unsuffixed: inferred, defaulting to `i32`. |
| Float | `3.14`, `1e-3`, `2.5f32` | Unsuffixed defaults to `f64`. |
| Bool | `true`, `false` | Not integers. |
| Char | `'a'`, `'\n'`, `'\u{1F980}'` | A Unicode scalar value. |
| Byte | `b'a'`, `b'\0'` | Type `u8`. |
| String | `"hello\n"` | Type `&life(static) str`, UTF-8. Escapes: `\n \r \t \\ \" \0 \u{...}`. |

Because lifetimes use `life(...)` rather than a tick, **a `'` is always a char literal**. There is no "unclosed char" ambiguity anywhere in the grammar.

### 4.4 Punctuation and the semicolon rule

- Simple statements end with `;`. Block statements (`if`, `while`, `for`, `switch`, `unchecked`, bare `{ }`) do not.
- Struct field declarations end with `;`.
- Enum variants are separated by `,` (trailing comma allowed).
- Struct initializer fields are separated by `,` (trailing comma allowed).
- `switch` cases are `case P: { ... }` with no separator.
- `*` means multiplication in infix position and dereference in prefix position. `&` means bitwise-and in infix position and borrow in prefix position. The parser decides by position, as in C.
- `#` is reserved as the macro-invocation prefix (§20.5); `...` is reserved for variadic packs and spreads (§20.5). Neither is a token in v0 — a program using them is a syntax stop until macros land.


---

## 5. Types

### 5.1 Primitive types

| Type | Meaning |
|---|---|
| `i8` `i16` `i32` `i64` `isize` | Signed integers (two's complement). `isize`/`usize` are pointer-sized. |
| `u8` `u16` `u32` `u64` `usize` | Unsigned integers. `usize` is the type of lengths and indices. |
| `f32` `f64` | IEEE 754 floats. |
| `bool` | `true` / `false`. Not an integer. |
| `char` | One Unicode scalar value (4 bytes). |
| `never` | The type of expressions that don't return (`trap(...)`, `exit(...)`). Coerces to any type. Only written by users in signatures such as `fn die() -> never`. |

A function with no `->` returns nothing. There are no tuples; return a small `struct` instead.

### 5.2 Compound and unsized types

- **Arrays:** `[T; N]` with `N` a constant expression. Literal `[1, 2, 3]`, repeat form `[0; 16]`. Arrays live inline (on the stack or inside their owner) and are bounds-checked on every index. A large repeat init (`[0u8; 1 << 20]`) lowers to a runtime fill loop, not one store per element, so a big buffer stays a constant amount of emitted code.
- **Slices:** `[T]` is unsized and only appears behind a reference: `&[T]`, `&mut [T]`. A slice reference is a (pointer, length) pair. Make one with `&a[1..3]` or `&v[..]`.
- **`str`:** UTF-8 text, unsized, only behind a reference: `&str`. You cannot index a `str` by integer (`s[3]` is a type error, because "the 3rd what?"). Use `s.as_bytes()`, `s.chars()`, or slice by byte range, `&s[lo..hi]`, which **traps** if either end is not on a character boundary.
- **Structs and enums:** user-defined (see §6). No unions.

### 5.3 Standard owning types

| Type | Owns | Notes |
|---|---|---|
| `String` | a growable UTF-8 buffer on the heap | Created with `"text".own()` or `String::make()`. |
| `Vec<T>` | a growable buffer of `T` on the heap | `Vec::make()`. |
| `Heap<T>` | one `T` on the heap | Created with `heap(expr)`. |
| `Maybe<T>` | zero or one `T` | Replaces null. |
| `Outcome<T, E>` | a success `T` or a failure `E` | Replaces error codes and exceptions. |

`Maybe` and `Outcome` are not magic; they are ordinary enums in the prelude:

```c
copy enum Maybe<T>      { Has(T), Empty, }
copy enum Outcome<T, E> { Good(T), Bad(E), }
```

`copy` on a **generic** type is conditional: `Maybe<i32>` is copy, `Maybe<String>` is not.

### 5.4 References

```c
&T                 // shared (read-only) reference
&mut T             // exclusive (read-write) reference
&life(a) T         // shared reference with a named life (see §11)
&mut life(a) T
```

- `&T` is `copy`: you can duplicate a shared reference freely.
- `&mut T` is **not** copy (there can be only one). When passed to a parameter of type `&mut T` it is implicitly **reborrowed**, so the original is usable again after the call.
- There are no null references and no references to references of unknown life.

### 5.5 Raw pointers (only meaningful in `unchecked`)

```c
raw T              // pointer to T, may be null, may dangle
raw mut T          // same, writable
```

Creating one is safe (`raw(&x)`); **using** one (dereference, arithmetic, read, write) requires `unchecked`. Details in §13.

### 5.6 Which types are `copy`

| Type | `copy`? |
|---|---|
| All integer, float, `bool`, `char` types | yes |
| `&T`, `raw T`, `raw mut T` | yes |
| `fn(A, B) -> R` (v1) | yes |
| `[T; N]` | iff `T` is copy |
| `String`, `Vec<T>`, `Heap<T>` | **no** |
| `&mut T` | **no** (reborrowed instead) |
| `Maybe<T>`, `Outcome<T, E>` | iff all type arguments are copy |
| User struct/enum marked `copy` | yes (the compiler verifies) |
| User struct/enum **not** marked `copy` | no |

### 5.7 Rules for marking a type `copy`

A `copy struct` / `copy enum` is accepted only if:

1. every field is `copy`,
2. no field is a `&mut`, and
3. the type has no `cleanup` method (a type that needs cleanup cannot be silently duplicated).

Violations produce `TYPE-05` (§16).

### 5.8 Generics

```c
fn largest<T: copy + ord>(items: &[T]) -> Maybe<T> { ... }
struct Stack<T> { items: Vec<T>; }
struct View<life a> { text: &life(a) str; }
```

- Parameters are **types** (`T`) and **lives** (`life a`). They are implemented by monomorphization (one copy of the code per instantiation), so there is no runtime cost and no runtime type information.
- **Bounds** are compiler-known markers, not user-definable abilities (user-defined `abilities` blocks arrive in v1, §20.4):

| Bound | Meaning | Who satisfies it |
|---|---|---|
| `copy` | duplicable by assignment | see §5.6 |
| `eq` | supports `==` and `!=` | primitives, `str`, `String`, and any user type whose fields are all `eq` (structural) |
| `ord` | supports `<` `<=` `>` `>=` (implies `eq`) | numbers, `char`, `str`, `String`, and user types structurally (fields in order; enum variants by declaration order) |

- Combine bounds with `+`. Without a bound you can move, store, and borrow a `T`, nothing more.
- Floats satisfy `eq`/`ord` under IEEE rules (comparisons with NaN are false).
- Variance of lives is inferred by the compiler. You never write it.

### 5.9 Type inference

Local only. Function signatures, struct fields, and `const`s are always fully annotated. `let` infers from its initializer or from later use:

```c
let a = 5;                 // i32 (default)
let b = 5u8;               // u8
let mut v = Vec::make();   // Vec<?>, resolved by the first push
v.push(1.5);               // now Vec<f64>
```

### 5.10 Conversions

There are **no implicit conversions**, not even `i8` to `i32`.

`x as T` exists for **lossless** conversions only:

| From | `as` allowed to |
|---|---|
| any integer | any strictly wider integer of compatible signedness (`u8`→`i32` ok, `i32`→`u64` not ok) |
| `i8` `i16` `i32` `u8` `u16` `u32` | `f64` |
| `i8` `i16` `u8` `u16` | `f32` |
| `f32` | `f64` |
| `char` | `u32` |
| `u8` | `char` |

Everything else is explicit and says what it does:

```c
let big: i64 = 300;
let a: Maybe<u8> = big.narrow<u8>();   // Empty: 300 doesn't fit
let b: u8        = big.wrap<u8>();     // 44: keeps the low bits
let c: u8        = big.sat<u8>();      // 255: clamps
let d: f64       = big.approx<f64>();  // nearest representable float
let e: Maybe<i32> = 3.9.narrow<i32>(); // Has(3); Empty for NaN or out of range
let f: Maybe<char> = char::from_code(0x1F980);
```

### 5.11 Function pointer types (v1)

A function name can be used as a value. Its type is a first-class,
pointer-sized **function pointer**, written `fn(ParamTypes) -> ReturnType`:

```c
fn add(a: i32, b: i32) -> i32 { return a + b; }

fn apply(f: fn(i32, i32) -> i32, a: i32, b: i32) -> i32 {
    return f(a, b);              // indirect call
}

let f: fn(i32, i32) -> i32 = add;  // annotated
let g = add;                       // inferred from the function signature
let sum = apply(add, 20, 22);      // function name as an argument
let h = math::double;              // an imported function works too
```

Function pointer types are **structural**: `fn(i32) -> i32` matches any
declared function with that exact parameter and return signature; a mismatch
is a `TYPE-01` error. An indirect call checks arity (`TYPE-04`) and argument
types (`TYPE-01`) from the pointer's signature. A function pointer is `copy`,
can be stored in locals, struct fields and arrays, returned from functions,
and reassigned. The bare `fnptr(name)` intrinsic remains the separate,
final-only way to obtain an **opaque** address for thread entry points
(§20.3 item 4); it is not a typed function value. Closures and captured
environments are deliberately not part of v1.

---

## 6. Declarations

### 6.1 Variables: `let`, `let mut`, deferred initialization

```c
let x = 5;                  // immutable, inferred i32
let mut total: i32 = 0;     // mutable, explicit type
let y: i32;                 // declared, not yet initialized
if (x > 3) { y = 1; } else { y = 2; }
println("{}", y);           // ok: initialized on every path
```

- Immutable by default. Assigning to a non-`mut` binding is `MUT-01`.
- Reading a variable that might not be initialized on some path is `INIT-01`.
- Redeclaring a name in the **same** scope is an error (`NAME-03`). Redeclaring in a **nested** scope is allowed with a `SHADOW-01` warning.
- There are **no mutable globals**. Global state would break the exclusivity rule without a concurrency story.

### 6.2 Constants

```c
const MAX_PLAYERS: usize = 8;
const GREETING: &life(static) str = "hello";
const LIMITS: [i32; 3] = [10, 20, 30];
```

Constants are inlined, must have a compile-time-evaluable initializer (literals, arithmetic, other constants, array/struct literals), and have no address identity.

### 6.3 Functions

```c
fn add(a: i32, b: i32) -> i32 {
    return a + b;
}

fn bump(mut n: i32) -> i32 {      // `mut` on a parameter: the local copy is mutable
    n += 1;
    return n;
}

fn greet(name: &str) {            // no `->`: returns nothing
    println("hello, {}", name);
}
```

- Parameter types and return types are always written out.
- Parameters are passed **by value** (moved or copied). Borrow explicitly with `&` / `&mut`.
- Every path must end in `return` (or a diverging call) when the function has a return type. The checker understands exhaustive `switch`.
- No overloading, no default arguments, no variadics. (`print`, `println`, `eprintln`, `format` are recognized by the compiler only for their format strings, `FMT-01`; their bodies are library code, see §19.8.2 and §19.8.6.)
- Recursion is fine; runaway recursion traps (`T-STACK`), it does not corrupt memory.
- Entry point: `fn main()` or `fn main() -> i32` (the return value is the process exit code).

### 6.4 Structs

```c
copy struct Point { x: i32; y: i32; }          // plain data: assignment copies
struct Player { name: String; pos: Point; }    // owns a String: assignment moves

let p = Point { .x = 1, .y = 2 };              // designated initializer (C99 style)
let q = Point { .y = 5, .x = 4 };              // order doesn't matter
```

- Every field must be initialized; there is no default and no partial initialization.
- Field access with `.`, through values, `&`, `&mut`, and `Heap` alike (no `->`).
- Field order in the declaration is the order of cleanup (see §12.6).
- Fields are visible wherever the struct is visible; there is no per-field privacy in v0.

### 6.5 Enums

```c
copy enum Shape { Circle(f64), Rect(f64, f64), Dot, }

let s = Shape::Circle(2.0);
let d = Shape::Dot;
```

- Variants are namespaced under the enum for construction (`Shape::Dot`). Inside a `switch` on a known enum type, patterns may use bare names (`case Dot:`). The prelude enums (`Maybe`, `Outcome`) are also available bare everywhere: `Has(5)`, `Empty`, `Good(x)`, `Bad(e)`.
- Payload fields are positional. If you want names, use a struct as the payload.
- An enum is always a tagged union; the tag is hidden, so there is no way to read the wrong variant.

### 6.6 Methods

```c
struct Counter { count: u32; }

methods Counter {
    export fn make() -> Counter {            // associated function (no self)
        return Counter { .count = 0 };
    }

    export fn bump(&mut self) {              // exclusive access to self
        self.count += 1;
    }

    export fn get(&self) -> u32 {            // shared access to self
        return self.count;
    }

    export fn finish(self) -> u32 {          // consumes self
        return self.count;
    }
}

fn main() {
    let mut c = Counter::make();
    c.bump();
    println("{}", c.get());
    let final_count = c.finish();            // c is moved; can't be used after this
}
```

Rules:

- `methods Type { ... }` may appear several times per type, in the same module as the type.
- Generic form: `methods<T> Stack<T> { ... }`; with lives: `methods<life a> Words<life(a)> { ... }`.
- A methods block may also name one instantiation: `methods Box<u8> { ... }`. Its methods exist only on `Box<u8>` — calling one on a `Box<i32>` is a type error, not a coercion.
- When several blocks declare the same method name on one generic type, a nested receiver pattern is more specific: `methods<T> Box<Box<T>> { fn get }` wins for a `Box<Box<i32>>` receiver over `methods<T> Box<T> { fn get }`.
- **Method call resolution** for `x.m(...)`: (1) look up `m` on the type of `x`, auto-dereferencing through `&`, `&mut`, and `Heap`; (2) auto-borrow to match the method's `self` form. `&self` borrows shared, `&mut self` requires `x` to be a mutable place (`let mut`, or already a `&mut`), and plain `self` moves (or copies, for `copy` types).
- The special method **`cleanup(&mut self)`** is the destructor hook (§12.6). The special method **`next(&mut self) -> Maybe<T>`** makes a type iterable by `for` (§8.5).

### 6.7 Modules

One file is one module. No headers, no include guards.

```c
// geometry.src
export struct Vec2 { x: f64; y: f64; }

export fn length(v: &Vec2) -> f64 {
    return sqrt(v.x * v.x + v.y * v.y);
}

fn helper() { }                      // private to this file

// main.src
import "geometry.src";

fn main() {
    let v = geometry::Vec2 { .x = 3.0, .y = 4.0 };
    println("{}", geometry::length(&v));
}
```

- Items are private unless marked `export`.
- `import "path";` makes the file's exported items available under the file's base name as a namespace.
- The path resolves relative to the importing file. `.` and `..` segments are
  normalized, so the same file always has one identity: two importers that
  spell the path differently (`"lib/shared.harmony"` and
  `"lib/nested/../shared.harmony"`) share **one** module, merged once.
- Import cycles are an error. The standard library is in the implicit prelude plus a handful of importable modules (`import "std/io.src";`).

*harmony-base (bootstrap) implements this as an eager merge:* every module is
loaded depth-first (each merged once, in source order), imported items are
renamed `modname::name` (binding exactly like a flattened enum path), and the
whole program is checked and emitted as one flat module — deterministic, so
`import`ed and single-file programs compile to the same-shaped IR. A module's
private helpers merge under its namespace too (bootstrap simplification: the
final compiler's loader enforces `export` visibility properly); a library
`main` merges as `modname::main` and the root file's `main` remains the entry
point. Missing imports and cycles are `NAME-04`. The module's identity is its
*normalized* path, so one file reached by two spellings is merged once.

### 6.8 Foreign functions (FFI to C)

```c
extern "C" fn abs(x: i32) -> i32;
extern "C" fn getenv(name: raw u8) -> raw u8;
```

- The **ABI is written down**: `extern` is followed by a string naming the
  calling convention, then `fn`. `extern fn ...` without the string is a
  syntax error (`SYN-05`) — the ABI is never an implicit default.
- The only ABI implemented today is `"C"`. Any other name is a stop
  (`FFI-01`), because the emitted `declare` uses the C convention and the
  compiler cannot keep a promise it does not implement.
- Signatures may use only primitives and `raw` pointers (no structs by value in v0).
- Every call to an `extern "C" fn` requires `unchecked(...)`, because the compiler cannot see across the C boundary.

Why the restriction matters (and why the checker enforces it, `TYPE-02`): the
backend assumes one C ABI for the whole program, and several harmony types do
not match it at the boundary.
- A **struct or enum by value** uses a different ABI: harmony returns every
  aggregate through an `sret` hidden pointer, while C returns small (≤ 16 byte)
  values in registers. The mismatch links and then silently returns wrong data.
- A **fat reference** (`&str`, `&[T]`) is a (pointer, length) pair in harmony,
  but a C parameter is one word, so the length is lost.
- A **`Heap<T>`** is an owned box the C side cannot know about (and passing it
  would move ownership across an opaque boundary).

The supported shapes cover the OS surface a freestanding program needs: scalars,
`raw T` / `raw mut T` (including `raw mut Struct` as an out-parameter, which is
how POSIX exposes `timeval`, `stat`, and friends), and a `()` (C `void`) return.

The ABI string is also carried into the emitted IR, so a reader of the `.ll`
sees which convention the foreign symbol uses:

```llvm
; extern "C" abs
declare i32 @abs(i32)
```

---

## 7. Expressions and operators

### 7.1 Expression forms

| Form | Examples |
|---|---|
| Literal | `42`, `3.14`, `true`, `'x'`, `b'x'`, `"text"` |
| Path | `x`, `Counter::make`, `Shape::Dot`, `geometry::length` |
| Call | `add(1, 2)`, `Counter::make()` |
| Method call | `v.push(3)`, `name.len()` |
| Field | `p.x`, `node.next` |
| Index | `a[i]`, `v[i]` (bounds-checked) |
| Slice | `&a[1..3]`, `&v[..]`, `&s[..5]` |
| Range | `0..10` (half-open), `0..=10` (inclusive) |
| Array | `[1, 2, 3]`, `[0; 16]` |
| Struct init | `Point { .x = 1, .y = 2 }` |
| Borrow | `&x`, `&mut x` |
| Deref | `*r`, `*heap_value` |
| Heap alloc | `heap(42)`, `heap(Node { .value = 1, .next = Empty })` |
| Cast | `x as i64` (lossless only) |
| Unary | `-x`, `!flag`, `~bits` |
| Binary | `a + b`, `a && b`, `a == b`, ... |
| Size | `sizeof(i32)`, `sizeof(Player)` |
| Raw pointer creation | `raw(&x)`, `raw(&mut x)` |

**Blocks, `if`, and `switch` are statements, not expressions.** Nothing here evaluates to "the last thing in the braces".

### 7.2 Precedence (highest first)

| Level | Operators | Associativity |
|---|---|---|
| 1 | `()` call, `[]` index, `.` field/method, `::` path | left |
| 2 | prefix `-` `!` `~` `*` `&` `&mut` | right |
| 3 | `as` | left |
| 4 | `*` `/` `%` | left |
| 5 | `+` `-` | left |
| 6 | `<<` `>>` | left |
| 7 | `&` (bitwise and) | left |
| 8 | `^` | left |
| 9 | `\|` | left |
| 10 | `==` `!=` `<` `<=` `>` `>=` | **non-associative** (`a < b < c` is a type error) |
| 11 | `&&` | left (short-circuit) |
| 12 | `\|\|` | left (short-circuit) |
| 13 | `..` `..=` | non-associative |

Notice that **bitwise operators bind tighter than comparisons**, which fixes C's classic `if (flags & MASK == 0)` bug.

### 7.3 Arithmetic semantics

| Operation | Behavior |
|---|---|
| `+ - *` on integers | **Trap on overflow** (`T-OVERFLOW`), in every build mode. |
| `/ %` | Trap on zero divisor (`T-DIV0`) and on `MIN / -1`. |
| `<< >>` | Trap if the shift amount is negative or ≥ the bit width. `>>` is arithmetic for signed types, logical for unsigned. |
| Unary `-` | Traps on `MIN`. |
| Mixed types | `i32 + i64` is a type error. Convert explicitly first. |
| Explicit alternatives | `a.try_add(b)` → `Maybe<T>`, `a.wrap_add(b)` wraps, `a.sat_add(b)` clamps. Same families for `sub`, `mul`, `neg`, `shl`. |
| Floats | IEEE 754. No traps. NaN compares false to everything, including itself. |

### 7.4 Equality and ordering

- `==` / `!=` require the `eq` bound; `<` `<=` `>` `>=` require `ord`.
- Comparing different types is a type error. There is no "compare int to bool" and no pointer comparison via `==` on references: `==` on references compares the **referents**.
- `bool` is not an integer: `true + 1` is a type error.

### 7.5 Evaluation order

Left to right, always: operands of binary operators, call arguments, array elements, struct initializer fields (in the written order, not declaration order). `f(a(), b())` calls `a` then `b`. The C idiom `i = i++ + ++i` is not expressible, and every compiled program agrees on what any expression does.

### 7.6 Temporaries

A temporary lives until the end of the statement that created it, with one exception: `let r = &make_value();` extends the temporary's life to the end of the enclosing block, so the common "borrow a fresh value" idiom works without surprises.

### 7.7 `sizeof`

`sizeof(Type)` gives the size in bytes as a `usize`. It is a compile-time constant and takes a type, never an expression (`sizeof(i32)`, `sizeof([u8; 16])`). Layout is **unspecified** (the compiler may reorder fields); do not rely on it outside FFI.

---

## 8. Statements and control flow

### 8.1 Declarations and assignment

```c
let mut n = 10;
n = 20;                  // assignment is a statement
n += 1;                  // compound: += -= *= /= %= &= |= ^= <<= >>=
a[2] = 7;                // index target
p.x = 3;                 // field target
*r = 9;                  // deref target (r: &mut i32)
```

Valid assignment targets are variables, fields, index expressions, and dereferences, and the target must be mutable (a `let mut` binding, or reached through a `&mut` / `Heap` owned by a mutable binding).

### 8.2 Expression statements

```c
v.push(1);
println("hi");
```

Ignoring a returned `Maybe` or `Outcome` is a warning (`UNUSED-02`): the compiler assumes you didn't mean to drop an error on the floor. Write `let _ = f();` to discard on purpose.

### 8.3 `if`

```c
if (a > b) {
    println("a");
} else if (a == b) {
    println("tie");
} else {
    println("b");
}
```

Parentheses and braces are mandatory. The condition must be `bool`.

### 8.4 `while`

```c
while (n > 0) {
    n -= 1;
}

while (true) {            // the infinite loop; there is no `loop` keyword
    if (done()) { break; }
}
```

`break` exits the innermost loop. `continue` jumps to the next iteration.

### 8.5 `for`: three shapes

```c
// 1. C-style: init is a `let`, then a bool condition, then an assignment step.
for (let mut i = 0; i < 10; i += 1) {
    total += i;
}

// 2. Range:
for (i : 0..10)  { ... }      // 0 through 9
for (i : 0..=10) { ... }      // 0 through 10

// 3. Collection or iterator:
for (n : &v)       { println("{}", n); }   // n: &T      (v still usable after)
for (n : &mut v)   { *n += 1; }            // n: &mut T  (v exclusively borrowed in the loop)
for (n : v)        { println("{}", n); }   // n: T       (v is consumed; gone afterwards)
```

**Teaching moment:** the three collection forms are the whole ownership story in miniature: look, edit, or consume.

While a loop borrows a collection, the body cannot change the collection's shape: `for (n : &v) { v.push(1); }` is `LOAN-01`. (That is the iterator-invalidation bug, caught at compile time.)

**The iteration protocol.** Any type with a method of exactly the shape `fn next(&mut self) -> Maybe<T>` is an *iterator*, and `for (x : it)` desugars to:

```c
let mut it = <expr>;
while (true) {
    switch (it.next()) {
        case Has(x): { /* body */ }
        case Empty:  { break; }
    }
}
```

The standard collections supply iterators (`v.iter()`, `v.iter_mut()`, `v.drain()`, `s.chars()`, `s.bytes()`) and the three `&v` / `&mut v` / `v` forms above are sugar for them. Users can write their own iterators with no traits involved (see `Words` in §17.5).

### 8.6 `switch`

```c
copy enum Shape { Circle(f64), Rect(f64, f64), Dot, }

fn area(s: Shape) -> f64 {
    switch (s) {
        case Circle(r):  { return 3.14159 * r * r; }
        case Rect(w, h): { return w * h; }
        case Dot:        { return 0.0; }
    }
}
```

```c
switch (code) {
    case 200:        { println("ok"); }
    case 301 | 302:  { println("redirect"); }     // or-pattern
    case 400..=499:  { println("client error"); } // range pattern
    default:         { println("something else"); }
}
```

**Rules**

1. **Exhaustive.** Every possible value must be handled. Enums: every variant (or `default`). Integers, `char`, `&str`: a `default` is required unless every value is listed. Missing a case is `CASE-01`.
2. **No fallthrough.** Each arm is a braced block. After it, control leaves the `switch`.
3. **`break` leaves the enclosing loop**, not the `switch`. Outside any loop, `break` in a `switch` is an error.
4. **Pattern kinds:** `_` (anything, binds nothing), an identifier (binds), a literal, a range `a..=b`, a variant with sub-patterns `Variant(p1, p2)`, and or-patterns `p1 | p2` (each alternative must bind the same names). There are no guards in v0 (use an `if` inside the arm). In v1, named-field patterns `Variant { field: pattern, ... }` and struct patterns `Point { x: 0, y: y }` are also accepted (§20.3 item 6).
5. **Binding modes**
   - Switching on an **owned** value: bindings take their payloads **by move** (or copy, if the payload is `copy`). Add `mut` to make a binding mutable: `case Has(mut node):`.
   - Switching on a **`&` / `&mut` reference**: bindings are **references** to the parts. (Matching on a reference gives you references to the pieces.)
6. **When is the scrutinee moved?** Only in arms that bind a non-`copy` payload by value. An arm like `case Empty:` doesn't move anything, so the scrutinee is still usable there.
7. **Unreachable arms** (already covered by earlier arms) are a warning, `CASE-02`.

### 8.7 `return`, `break`, `continue`

```c
return;            // from a function with no return type
return a + b;      // explicit value; there is no implicit "last expression" return
break;
continue;
```

### 8.8 Blocks and scope

A bare `{ ... }` is a statement that opens a scope. Locals are dropped in **reverse order of declaration** at the closing brace (see §12.7). This is how you shorten a borrow or free something early without a function call:

```c
{
    let big = String::make();
    // ... use big ...
}                      // big is freed here
```

### 8.9 Reachability

Code after `return`, `break`, `continue`, or a diverging call (`trap`, `exit`) is flagged as `DEAD-01` (warning).


---

## 9. Ownership and moves

### 9.1 The model

Every value lives in exactly one place, its **owner**: a variable, a struct field, an array slot, or a `Heap`/`Vec`/`String`. When the owner dies, the value is dropped (and, if it owns heap memory, that memory is freed) at the owner's closing `}`. There is no other way for memory to be freed, so it cannot be freed twice, and nothing can use it afterwards because the owner is gone.

### 9.2 What counts as a move

For a non-`copy` type, each of these **moves** the value and leaves the source unusable:

- `let b = a;` and `b = a;`
- passing it as a call argument: `consume(a)`
- `return a;`
- using it as a field in a struct initializer, or as an enum payload: `Player { .name = a, ... }`, `Has(a)`
- a by-value binding in `switch`
- `for (x : v)` (consumes `v`)
- calling a method that takes plain `self`
- `v.push(a)`

```c
fn consume(s: String)     { println("eating {}", s); }   // owns it; freed at `}`
fn peek(s: &String)       { println("looking at {}", s); }
fn shout(s: &mut String)  { s.push_str("!!!"); }

fn main() {
    let mut name = "Ada".own();
    peek(&name);        // ok: loan ends when peek returns
    shout(&mut name);   // ok: exclusive loan, also over
    consume(name);      // ownership handed over
    peek(&name);        // ERROR MOVE-01: name was moved on the line above
}
```

### 9.3 `copy` types

`copy` types are duplicated instead of moved, so the source stays valid:

```c
copy struct Point { x: i32; y: i32; }

let a = Point { .x = 1, .y = 2 };
let b = a;                          // copy
println("{} {}", a.x, b.x);         // both fine
```

### 9.4 `.clone()`: the explicit deep copy

For non-`copy` types, duplication is a deliberate, visible call:

```c
let a = "hello".own();
let b = a.clone();      // new heap buffer, new owner
consume(a);
peek(&b);               // fine
```

`clone` is generated **structurally** for any type whose fields are all cloneable (primitives, `String`, `Vec<T: clone>`, `Heap<T: clone>`, user types made of those). It cannot be written by hand in v0, and it is not available for `&mut T`.

### 9.5 Conditional moves and drop flags

If a value is moved on only some paths, it is *maybe moved* afterwards, and reading it is an error. The compiler still frees it correctly: it emits a hidden **drop flag** and frees the value at scope end only if it was never moved.

```c
let s = "x".own();
if (cond) {
    consume(s);
}
// println("{}", s);   // ERROR MOVE-01: `s` may have been moved
                       // at the closing brace: freed iff cond was false
```

### 9.6 Moves in loops

```c
let s = "x".own();
for (i : 0..3) {
    consume(s);        // ERROR MOVE-02: moved in the previous iteration
}
```

Fixes: clone each time, borrow instead, or restructure so each iteration owns a fresh value.

### 9.7 Re-initialization

A moved-from `let mut` binding can be assigned a new value and used again:

```c
let mut s = "a".own();
consume(s);
s = "b".own();         // ok: s owns a fresh value
peek(&s);
```

### 9.8 You cannot move out from behind a reference

```c
fn grab(v: &Vec<String>) -> String {
    return v[0];                       // ERROR MOVE-03: v only borrows the Vec
}
```

Remedies, in order of how often you want them:

| Want | Write |
|---|---|
| a copy of the element | `v[0].clone()` |
| to look at it | return `&v[0]` (with a matching `life`) |
| to take it out of a `&mut Vec` | `v.remove(0)` |
| to swap in a replacement | `replace(&mut slot, "".own())` |
| to take a `Maybe` and leave `Empty` | `slot.take()` |
| to swap two places | `swap(&mut a, &mut b)` |

### 9.9 No partial moves (v0)

Moving one field out of a struct while leaving the rest in place is `MOVE-04`:

```c
let n = player.name;          // ERROR MOVE-04: can't move one field out of `player`
```

Use `replace(&mut player.name, String::make())`, `.clone()`, or give the struct a method that takes `self` and returns what you need.

### 9.10 `drop` and `leak`

```c
drop(x);        // moves x into a function that does nothing; x is freed right here
leak(x);        // moves x into a function that never frees it (safe, but a leak)
```

`fn drop<T>(x: T) { }` really is the whole implementation: it takes ownership and the value dies at its `}`.

---

## 10. Borrowing

### 10.1 The rule

At any point in the program, for any value, **either** any number of shared borrows (`&`) **or** exactly one exclusive borrow (`&mut`) may be alive. Never both. While a value is borrowed, its owner may not move it, assign to it, or (for exclusive loans) even read it.

Why: shared + mutable at once is the root of iterator invalidation, aliasing bugs, and (with threads) data races. The rule makes whole families of bugs unwritable.

### 10.2 Liveness-based (non-lexical) borrows

A borrow lives from its creation to its **last use**, not to the end of its scope:

```c
let mut s = "hi".own();
let r = &s;
println("{}", r);      // last use of r: the borrow ends here
s.push_str("!");       // ok: nothing is borrowing s anymore
```

This alone removes about half of beginners' pain.

### 10.3 Making borrows

```c
let r1 = &x;                 // shared
let r2 = &mut y;             // exclusive: y must be declared `let mut`
v.len();                     // method call auto-borrows &v
v.push(1);                   // method call auto-borrows &mut v
```

Borrowing `&mut` from a non-`mut` binding is `MUT-03`.

### 10.4 The classic aliasing bug, caught

```c
let mut v = Vec::make();
v.push(1);
let first = &v[0];
v.push(2);                // ERROR LOAN-01: v is borrowed by `first`, and push might reallocate
println("{}", first);     // `first` is still alive here, hence the error
```

### 10.5 Reborrowing

Passing a `&mut T` variable to a function taking `&mut T` does not move it; the compiler creates a temporary shorter-lived borrow:

```c
fn double(x: &mut i32) { *x *= 2; }

fn main() {
    let mut n = 3;
    let r = &mut n;
    double(r);
    double(r);            // fine: each call reborrows
    println("{}", n);     // ok: r is dead by now; prints 12
}
```

### 10.6 Disjoint fields

Borrowing different fields of one struct at once is allowed, because the compiler can see they don't overlap:

```c
let a = &mut p.x;
let b = &mut p.y;         // fine
```

Through **method calls** it cannot see inside, so `p.bump_x()` and `p.bump_y()` both want `&mut p` and cannot overlap.

### 10.7 Two-phase borrows

`v.push(v.len());` is accepted. The `&mut v` for `push` is reserved first and only becomes active after the arguments are evaluated, so reading `v.len()` in between is fine. (It is the call every beginner writes on day two.)

### 10.8 Borrowing from collections

A reference into a `Vec`, `String`, or any owner borrows the **whole** owner. Growing or reallocating it while the reference lives is `LOAN-01`. If you need to hold onto an element across mutation, copy it out, or hold an **index** instead of a reference. (Indices are the idiomatic answer for graphs, trees with parent links, and anything self-referential.)

### 10.9 Borrow conflicts at a glance

| You hold | You try | Result |
|---|---|---|
| `&x` | read `x`, another `&x` | ok |
| `&x` | write `x`, `&mut x`, move `x` | `LOAN-01` |
| `&mut x` | read `x`, `&x`, another `&mut x` | `LOAN-02` / `LOAN-03` |
| `&mut x` | use `x` through the reference | ok |
| any borrow of `x` | `x` goes out of scope | `LIFE-02` |

---

## 11. Lifetimes: `life`

### 11.1 Mental model

A **life** is the stretch of the program during which a reference is guaranteed valid. Most of the time the compiler works it out. You only write lives when a function or struct has references and the compiler can't tell which input a returned reference came from. Lives exist **only at compile time**: no runtime representation, no cost.

### 11.2 The syntax: **`life a` declares, `life(a)` uses**

Just like `let x` then `sizeof(x)`:

```c
fn longest<life a>(x: &life(a) str, y: &life(a) str) -> &life(a) str {
    if (x.len() > y.len()) {
        return x;
    }
    return y;
}
```

| Concept | Syntax |
|---|---|
| Declare a life parameter | `<life a>` or `<life a, life b, T>` |
| Shared reference with a life | `&life(a) T` |
| Exclusive reference with a life | `&mut life(a) T` |
| Life as a type argument | `Words<life(a)>` |
| Whole-program life | `life(static)` (string literals are `&life(static) str`) |

It parses cleanly because `life` is a keyword followed by parentheses, so there is no dangling `'`. Considered and rejected:

| Style | Looks like | Verdict |
|---|---|---|
| `life(a)` | `&life(a) str` | **Chosen.** Explicit, greppable, `sizeof`-shaped. |
| `in a` | `&str in a` | Reads like English, but overloads `in`. |
| `(a)` | `&(a) str` | Shortest, but cryptic to beginners. |

### 11.3 Elision: when you can leave `life` out

1. Each elided reference in the **parameters** gets its own fresh life.
2. If there is **exactly one** life in the inputs, every elided output reference gets it.
3. If one input is `&self` or `&mut self`, every elided output reference gets **self's** life.

Otherwise the compiler stops with `LIFE-03` and asks you to annotate.

```c
fn first_word(s: &str) -> &str { ... }
// means: fn first_word<life a>(s: &life(a) str) -> &life(a) str

methods Player {
    fn name(&self) -> &str { return self.name.as_str(); }
    // output tied to self
}
```

### 11.4 Several lives

```c
fn pick<life a, life b>(x: &life(a) str, y: &life(b) str) -> &life(a) str {
    return x;                 // the result only depends on x's life
}
```

Here the caller may drop `y`'s owner while still using the result.

### 11.5 Structs that hold references

Struct fields never elide lives; write them out:

```c
struct Words<life a> {
    text: &life(a) str;
    pos: usize;
}

copy struct Span<life a> {            // a struct of shared refs can be copy
    text: &life(a) str;
}
```

A value of type `Words<life(a)>` cannot outlive the text it points at; the compiler enforces it.

### 11.6 Methods on types with lives

```c
methods<life a> Words<life(a)> {
    export fn make(text: &life(a) str) -> Words<life(a)> {
        return Words { .text = text, .pos = 0 };
    }

    // Returns a slice of the ORIGINAL text (life a), not of `self`,
    // so a returned word may outlive the Words iterator itself.
    export fn next(&mut self) -> Maybe<&life(a) str> {
        // scan from self.pos ...
    }
}
```

(Full body in §17.5.)

### 11.7 The dangling case

```c
fn broken() -> &str {          // ERROR LIFE-03: no input to borrow from
    let s = "hi".own();
    return &s;                 // would hand out a pointer into a demolished house
}
```

Even if you annotated it, returning `&s` is `LIFE-01`: `s` dies at the `}`. Fixes: return the `String` itself, or a `&life(static) str` literal.

### 11.8 Limits of v0

- No **outlives bounds** (`life a` must outlive `life b`). The compiler infers what it needs; code that requires explicit bounds is rejected with a note.
- No higher-ranked lives, no self-referential structs. Use indices.
- `life` is contextual, so a field called `life` is fine.

---

## 12. The heap, `heap(...)`, and `cleanup`

### 12.1 Where values live

| Value | Lives |
|---|---|
| Locals, arrays, structs, enums | inline in the stack frame (or inside their owner) |
| `String`, `Vec<T>`, `Heap<T>` payloads | on the heap, owned by the handle on the stack |

### 12.2 `heap(x)` and `Heap<T>`

```c
let mut b: Heap<i32> = heap(42);
*b += 1;
// no free(), no delete, no GC. `b` is freed at the closing brace.
```

`heap(x)` is a built-in form, styled after `sizeof(T)`: it evaluates `x`,
moves it to a fresh heap allocation, and yields `Heap<T>`. There is no
`delete`; the owner's closing brace is the `delete`. Nothing leaks.

```c
fn push_front(head: Maybe<Heap<Node>>, value: i32) -> Maybe<Heap<Node>> {
    return Has(heap(Node { .value = value, .next = head }));
}

enum Tree { Leaf, Branch(Heap<Tree>, i32, Heap<Tree>) }

let t = Tree::Branch(heap(Tree::Leaf), 5, heap(Tree::Leaf));
```

**In-place construction.** Because `heap(...)` names its argument, the
compiler is allowed to construct the value directly in the allocation
instead of building it on the stack and copying it in. This matters for
large arrays:

```c
let big = heap([0u8; 8_000_000]);   // constructed in place; no 8 MB stack copy
```

The observable semantics are identical either way — `heap(x)` always yields
an owned `Heap<T>` whose pointee is a moved copy of `x`'s value — so the
optimization is never visible, only faster.

- `Heap<T>` is **not** `copy`; moving it moves ownership of the allocation (just a pointer copy at runtime).
- `*h` dereferences. `.` auto-dereferences through `Heap`, `&`, and `&mut`, so there is no `->` anywhere. The same auto-deref applies to indexing (`h[i]`), slicing (`&h[a..b]`), and `.len()`, so a `Heap<[T; N]>` is used exactly like the array it points at; write `*h` only when you want the array value itself.
- `Maybe<Heap<T>>` compiles to a single nullable pointer in the backends, so a linked-list link costs one word.
- A failed allocation is `T-OOM`, a trap, never undefined behavior.

### 12.3 Recursive types need `Heap`

```c
struct Node {
    value: i32;
    next: Maybe<Heap<Node>>;      // without Heap, Node would have infinite size
}
```

### 12.4 Heap-allocation cheat sheet

| You want | Write |
|---|---|
| One owned heap value | `heap(expr)` → `Heap<T>` |
| A growable list | `Vec<T>` |
| A growable string | `String` |
| A fixed-size buffer | `[T; N]` (stack) or `Vec<T>` |
| Optional ownership | `Maybe<Heap<T>>` |

### 12.5 Dropping

A value is dropped when its owner's scope ends, when it is overwritten by assignment, or when passed to `drop`. Dropping a struct drops its fields; dropping a `Vec` drops its elements then frees the buffer; dropping a `Heap` drops the pointee then frees the allocation.

### 12.6 The `cleanup` hook (destructors without traits)

A method named `cleanup` with the exact signature `fn cleanup(&mut self)` runs **automatically, exactly once**, just before the value's fields are dropped:

```c
struct Logger { name: String; }

methods Logger {
    fn cleanup(&mut self) {
        println("closing logger {}", self.name);
    }
}

fn main() {
    let a = Logger { .name = "first".own() };
    let b = Logger { .name = "second".own() };
}   // prints: closing logger second, then: closing logger first
```

Rules:

- You cannot call `x.cleanup()` directly (`DROP-01`); use `drop(x)`.
- A type with `cleanup` cannot be `copy`.
- You cannot move a field out of a value whose type has `cleanup` (already true: no partial moves).
- `cleanup` does **not** run if the program traps or calls `exit` (the OS reclaims memory; see §14.3).

### 12.7 Drop order

1. Locals are dropped in **reverse declaration order** at scope end.
2. Within a value: its `cleanup` hook first, then fields **in declaration order**.
3. Temporaries are dropped at the end of their statement (unless extended, §7.6).
4. Function arguments are dropped by the callee (it owns them) at the callee's closing brace, in reverse parameter order.

### 12.8 Known sharp edge

Dropping a very long singly linked list recurses through `Heap<Node>` drops and can hit the stack limit (`T-STACK` trap, not a crash). The fix is a hand-written iterative `cleanup` that peels nodes off in a `while` loop. The compiler warns (`DROP-02`) on directly recursive `Maybe<Heap<Self>>` types without a `cleanup`.

---

## 13. `unchecked`: taking the seatbelt off on purpose

Some things cannot be proven by a compiler: talking to C, implementing `Vec` itself, squeezing a hot loop. `unchecked` is the one door out of the safe subset, and the design goal is that **the door has a label, a lock, and a logbook.**

### 13.1 Syntax

```c
// A block: "I am doing something the compiler can't verify, and here is why."
unchecked("p came from alloc(8) and slot 3 was written above") {
    let x = p.plus(3).read();
}

// A function: "calling me has a contract the compiler can't verify."
unchecked("p must point to at least n initialized, readable bytes")
fn sum_bytes(p: raw u8, n: usize) -> u64 {
    // body is NOT automatically unchecked (see 13.4)
}
```

The string is **mandatory**. For a block it is the *justification*. For a function it is the *contract* callers must meet, and it is shown to callers in diagnostics.

### 13.2 The seven powers

`unchecked` unlocks exactly these operations, and nothing else:

| # | Power | Examples |
|---|---|---|
| 1 | Dereference or use a raw pointer | `*p`, `p.read()`, `p.write(v)`, `&*p`, `&mut *p` |
| 2 | Raw pointer arithmetic | `p.plus(n)`, `p.minus(n)` |
| 3 | Call an `unchecked fn` | `alloc<T>(n)`, `dealloc(p, n)`, your own |
| 4 | Call an `extern "C" fn` | `abs(-5)` from C |
| 5 | Reinterpret bits | `reinterpret<T, U>(x)` (sizes must match) |
| 6 | Skip a bounds check | `v.get_unchecked(i)` |
| 7 | Take ownership from a raw pointer | `Heap::from_raw(p)` |

Safe even outside `unchecked`: *creating* a raw pointer (`raw(&x)`), `Raw::null<T>()`, `p.is_null()`, comparing raw pointers, and `Heap::into_raw(h)` (it only stops tracking; at worst you leak).

### 13.3 What `unchecked` does **not** do

It does not turn off type checking, move checking, borrow checking of ordinary references, definite-initialization checking, bounds checks on ordinary `a[i]`, or overflow traps. A block full of `let` and `switch` inside `unchecked` is still fully checked; only the seven operations above are unlocked. It is a scalpel, not a kill switch.

### 13.4 Rules enforced by the compiler

| Rule | Code |
|---|---|
| An unlocked operation outside `unchecked` | `UNCK-01` |
| Reason string missing, empty, not a plain string literal, or under 12 characters | `UNCK-02` |
| An `unchecked` block longer than 10 lines (warning: shrink the blast radius) | `UNCK-03` |
| Calling an `unchecked fn` outside an `unchecked` block | `UNCK-04` |
| Any `unchecked` while building with `--deny-unchecked` | `UNCK-05` |

- The **body of an `unchecked fn` is not automatically unchecked.** "Calling me has a contract" and "I'm about to do something risky" are different statements, so the risky operations inside still need their own block with their own reason.
- An `unchecked` block is a statement. To get a value out, assign to a variable declared before it.
- `unchecked("trust me")` is rejected by the length rule. (The rule does not claim to detect lies. It only makes them longer to type and easier to grep.)

### 13.5 Raw pointer toolbox

| Operation | Needs `unchecked`? |
|---|---|
| `raw(&x)` → `raw T`, `raw(&mut x)` → `raw mut T` | no |
| `Raw::null<T>()`, `p.is_null()`, `p == q` | no |
| `*p`, `*p = v`, `&*p`, `&mut *p` | yes |
| `p.read() -> T` (moves a value out, leaving the slot logically empty) | yes |
| `p.write(v: T)` (moves a value in without dropping what was there) | yes |
| `p.plus(n: usize)`, `p.minus(n: usize)` | yes |
| `p[i]` (index through a raw pointer; `p[i] = v` needs `raw mut T`) | yes |
| `p as <integer>`, `<integer> as raw T` | yes |
| `alloc<T>(n: usize) -> raw mut T` (uninitialized room for `n` Ts) | yes |
| `dealloc<T>(p: raw mut T, n: usize)` | yes |
| `reinterpret<T, U>(x: T) -> U` | yes |
| `Heap::from_raw(p: raw mut T) -> Heap<T>` | yes |
| `Heap::into_raw(h: Heap<T>) -> raw mut T` | no |
| `v.get_unchecked(i: usize) -> &T` | yes |

### 13.6 Undefined behavior, precisely

The language has **no undefined behavior** except as a consequence of a false `unchecked` claim. Define a program's *trusted surface* as the set of its `unchecked` sites (including those in libraries it links). Then:

- If the trusted surface is empty, the program's behavior is fully defined: it runs, or it traps with a message.
- If the trusted surface is non-empty, undefined behavior can only originate at one of those sites.

"A trap is a bug report. Undefined behavior is a bug that lies to you."

### 13.7 The encapsulation principle

Good `unchecked` code lives behind a **safe API**: `Vec`, `String`, and `Heap` are implemented with `unchecked` internally, and expose methods that cannot misbehave. Application code is expected to contain zero `unchecked`, except at FFI boundaries. A worked example (`MiniVec`) is in §17.8.

### 13.8 Auditing

```
$ lc audit
unchecked audit · 4 sites · 11 lines total

  src/mini_vec.src:21   block   "grow() guarantees cap > len, so slot len is inside our allocation"
  src/mini_vec.src:44   block   "i < len was checked above and slots 0..len are initialized"
  src/mini_vec.src:57   block   "slots 0..len are initialized and owned by us; each is read out once"
  src/main.src:9        block   "libc abs() is only undefined for i32::MIN and we pass -5"

  0 sites under 12 characters · 0 sites over 10 lines
```

`lc audit --json` is intended for CI: fail the build if the site count in application code increases without review.

*harmony-base (M1) implements this listing with an ASCII separator (`-`
instead of `·`) and no surrounding quotes, so it stays grep-friendly and
byte-stable:*

```
$ harmony-base audit src/mini_vec.src
unchecked audit - 4 sites - 11 lines total

  src/mini_vec.src:21   block   grow() guarantees cap > len, so slot len is inside our allocation
  src/mini_vec.src:44   block   i < len was checked above and slots 0..len are initialized

  0 sites under 12 characters - 0 sites over 10 lines
```

`harmony-base audit --format=json` prints one object for the whole file
(`file`, `sites[]`, `total`, `lines`, `short`, `oversized`). An `unchecked fn`
appears as a `fn` site at its declaration line (its contract is the reason).

---

## 14. Runtime traps and error values

### 14.1 Traps

A **trap** is a controlled, immediate stop with a message, used when a bug is detected at runtime. It replaces the undefined behavior C would have had.

| Code | Trigger |
|---|---|
| `T-INDEX` | index out of range on array, slice, `Vec`, or `s.as_bytes()[i]` |
| `T-SLICE` | bad slice range, or `str` slice not on a character boundary |
| `T-OVERFLOW` | integer overflow in `+ - * neg` |
| `T-DIV0` | division or remainder by zero, or `MIN / -1` |
| `T-SHIFT` | shift by a negative or too-wide amount |
| `T-OOM` | allocation failed |
| `T-STACK` | stack exhausted (guard page hit) |

Any other invalid memory access is a violated `unchecked` contract (§13.6),
not a trap: the runtime does not dress it up as one. The stack guard only
reports `T-STACK` when the fault address is in the guard page under the stack;
anything else re-raises the signal, so the process dies with a real `SIGSEGV`
and the driver reports the signal number.
| `T-ASSERT` | `assert(cond)` / `assert(cond, "msg")` failed |
| `T-EXPECT` | `.or_trap("msg")` on `Empty` / `Bad` |
| `T-USER` | explicit `trap("msg")` |
| `T-UNREACHABLE` | `unreachable()` was reached |

### 14.2 Trap output

```
TRAP  T-INDEX  index out of range
      index 7, length 3                          main.src:12:5
      call chain:  average  ◂  summarize  ◂  main
```

### 14.3 Trap behavior

- Writes the message to `stderr`, flushes `stdout`, and exits with status **70**.
- **No unwinding, no catching.** Control never returns into the program.
- `cleanup` hooks do **not** run (the OS reclaims memory). Don't put "save the file" logic in a `cleanup` and expect it to survive a trap.
- Same for `exit(code)`, which stops immediately without running hooks.

The compiler's only job here is to emit a call to the trap hook **with the
source location** at the point that can trap. The message format, the flush,
the exit status, and the `on_trap` hook are library/runtime code (§19.8.4),
so freestanding targets can replace them.

### 14.4 Errors that are expected: `Maybe` and `Outcome`

Use values, not traps, for things that can reasonably go wrong:

```c
fn parse_digit(c: char) -> Maybe<u32> {
    switch (c) {
        case '0'..='9': { return Has(c as u32 - '0' as u32); }
        default:        { return Empty; }
    }
}

enum ParseError { NoInput, BadChar(char), TooBig, }

fn parse_u8(text: &str) -> Outcome<u8, ParseError> {
    if (text.len() == 0) {
        return Bad(ParseError::NoInput);
    }
    let mut value: u32 = 0;
    for (c : text.chars()) {
        switch (parse_digit(c)) {
            case Has(d): { value = value * 10 + d; }
            case Empty:  { return Bad(ParseError::BadChar(c)); }
        }
        if (value > 255) {
            return Bad(ParseError::TooBig);
        }
    }
    return Good(value.narrow<u8>().or_trap("checked above"));
}
```

There is no `?` operator in v0. Errors are handled with `switch`, which keeps control flow visible. *Implemented in the final compiler for v1 (§20.3 item 5):* an `else` clause on `let`, plain `=` assignment, and expression statements. `let n = parse_u8(text) else return;` binds the `Good` payload to `n` and forwards `Bad(e)` from an `Outcome`-returning function (or `Empty` from a `Maybe`-returning one). `let n = parse(s) else (e) { return Bad(AppError::Parse(e)); };` converts the error in an explicit block. The clause must not fall through: `return`, `break`, `continue`, `trap(...)` and `exit(...)` are legal exits (FLOW-01). Forwarding needs the same shape and error type (FLOW-02/03). The clause ends with `;`, keeping the "every simple statement ends with `;`" rule. `try` is **not** a keyword in the final design.

---

## 15. Standard library surface

The prelude (always in scope) plus a few importable modules. Signatures use the language's own syntax. Everything here is **library code**, not compiler magic: the boundary between the two is the split rule in §19.8. Where an item needs a compiler intrinsic (an overflow check, a bounds check, a pointer operation), §19.8 names the one intrinsic it rests on.

### 15.1 Prelude functions

| Function | Meaning |
|---|---|
| `print(fmt, ...)`, `println(fmt, ...)`, `eprintln(fmt, ...)` | Output (stdout / stderr). |
| `format(fmt, ...) -> String` | Build a `String`. |
| `trap(msg: &str) -> never` | Stop now (`T-USER`). |
| `assert(cond: bool)`, `assert(cond: bool, msg: &str)` | Trap if false. |
| `unreachable() -> never` | Trap if reached. |
| `exit(code: i32) -> never` | Stop now with an exit code. |
| `drop<T>(x: T)` | Free early. |
| `leak<T>(x: T)` | Never free (safe). |
| `swap<T>(a: &mut T, b: &mut T)` | Exchange two values. |
| `replace<T>(dst: &mut T, new: T) -> T` | Put a new value in, get the old one out. |

**Format strings** are checked at compile time (`FMT-01` on a mismatch in argument count or type): `{}` displays, `{?}` prints a structural debug form, `{:5}` width, `{:.2}` precision, `{:x}` hex, `{{` and `}}` for literal braces.

### 15.2 `String` and `str`

| Method | Meaning |
|---|---|
| `"lit".own() -> String` | Owned copy of a borrowed string (also `&[T]` → `Vec<T>`). |
| `String::make() -> String` | Empty string. |
| `s.len() -> usize` | Length in **bytes**. |
| `s.push(c: char)`, `s.push_str(t: &str)` | Append (needs `&mut`). |
| `s.as_str() -> &str` | Borrow as `str`. |
| `s.as_bytes() -> &[u8]` | Borrow the bytes. |
| `s.chars()`, `s.bytes()` | Iterators. |
| `s.find(t: &str) -> Maybe<usize>` | First match. |
| `s.starts_with(t)`, `s.ends_with(t)`, `s.contains(t)` | Tests. |
| `&s[lo..hi]` | Slice (traps off a char boundary). |
| `s.clone()` | Deep copy. |

### 15.3 `Vec<T>`

| Method | Meaning |
|---|---|
| `Vec::make()`, `Vec::with_room(n)` | Create. |
| `v.push(x)` / `v.pop() -> Maybe<T>` | End operations. |
| `v.len()`, `v.is_empty()` | Size. |
| `v[i]`, `v.get(i) -> Maybe<&T>`, `v.get_mut(i) -> Maybe<&mut T>` | Access (`v[i]` traps if out of range; `get` doesn't). |
| `v.last() -> Maybe<&T>` | Last element. |
| `v.insert(i, x)`, `v.remove(i) -> T` | Shifting edits. |
| `v.clear()` | Drop all elements. |
| `v.contains(&x)` (needs `eq`) | Search. |
| `v.iter()`, `v.iter_mut()`, `v.drain()` | Iterators (`&T`, `&mut T`, `T`). |
| `&v[a..b]` | Slice. |

### 15.4 `Maybe<T>` and `Outcome<T, E>`

| Method | Meaning |
|---|---|
| `m.or(default: T) -> T` | Value or fallback. |
| `m.or_trap(msg: &str) -> T` | Value or `T-EXPECT`. |
| `m.has() -> bool`, `m.is_empty() -> bool` | Tests. |
| `m.take(&mut self) -> Maybe<T>` | Move the value out, leave `Empty`. |
| `m.as_ref() -> Maybe<&T>`, `m.as_mut() -> Maybe<&mut T>` | Borrow the inside. |
| `o.ok() -> Maybe<T>`, `o.err() -> Maybe<E>` | Convert. |
| `o.or_trap(msg) -> T` | Value or `T-EXPECT`. |

### 15.5 Numbers

| Method | Meaning |
|---|---|
| `a.try_add(b)`, `try_sub`, `try_mul` → `Maybe<T>` | Checked. |
| `a.wrap_add(b)`, `wrap_sub`, `wrap_mul` | Wrapping. |
| `a.sat_add(b)`, `sat_sub`, `sat_mul` | Saturating. |
| `x.narrow<U>() -> Maybe<U>`, `x.wrap<U>() -> U`, `x.sat<U>() -> U`, `x.approx<F>() -> F` | Lossy conversions (§5.10). |
| `a.min(b)`, `a.max(b)`, `a.abs()`, `a.pow(n)` | Basics (`abs` and `pow` trap on overflow). |
| `i32::MIN`, `i32::MAX`, `u8::MAX`, ... | Limits. |

### 15.6 I/O and process (importable)

| Item | Meaning |
|---|---|
| `read_line() -> Outcome<String, IoError>` | One line from stdin. |
| `import "std/fs.src";` → `fs::read_to_string(path: &str) -> Outcome<String, IoError>` | Read a file. |
| `import "std/env.src";` → `env::args() -> Vec<String>` | Command-line arguments. |


---

## 16. Compiler diagnostics format

### 16.1 Design principles

1. **Tell the story of the value, not just the location of the symptom.** Ownership errors are about *time*: a value is born, moved, borrowed, and used. The diagnostic shows that timeline, numbered ①②③, so the reader sees the cause and the effect together.
2. **Plain English first, jargon second.** The sentence under the title is written for someone who has never heard the word "borrow checker".
3. **Always offer a fix.** Every `STOP` carries at least one concrete `try:` line with real code.
4. **One root cause, one report.** Follow-on errors that exist only because of an earlier one are folded in, not listed.
5. **Greppable and scriptable.** The first line is always `SEVERITY  CODE  file:line:col`.
6. **Never rely on color.** Numbers and words carry the meaning; color is decoration. `NO_COLOR` and `--ascii` are honored.
7. **Stable codes.** `MOVE-01` means the same thing forever. `lc explain MOVE-01` teaches it.
8. **Short.** A typical diagnostic fits on one screen without scrolling.

### 16.2 Anatomy

```
<SEVERITY>  <CODE>  <file>:<line>:<col>          ← header (always one line)
<title: one short line, lowercase, no period>

   <summary: one or two plain-English sentences>

   <marker> <line>  <source line, trimmed>   <label>         ← the story: 1 to 5 steps
   <marker> <line>  <source line, trimmed>   <label>  ◂ here ← the step that triggers the error

   try:  <fix 1 with real code>                              ← 1 to 3 fixes
   or:   <fix 2>
   or:   <fix 3>

   learn: lc explain <CODE>                                  ← always last
```

| Part | Rules |
|---|---|
| **Header** | Severity word, code, primary location (`col` points at the offending token). |
| **Title** | Names the problem in the user's terms, e.g. ``use of moved value `name` ``. |
| **Summary** | At most two sentences. No jargon the user hasn't met. |
| **Story** | Steps are in **time order**, not source order, when they differ. Each step shows the source line (trimmed to 48 columns, `…` if cut) and a label of at most 60 characters. The step that triggers the error ends with `◂ here`. Single-site diagnostics use `▸` instead of a number. |
| **Fixes** | `try:` is the preferred fix; `or:` are alternatives. Code in a fix is valid code for this program, with names filled in. |
| **Learn** | `lc explain CODE` prints the long-form lesson. |

### 16.3 Glyphs, alignment, color

| Role | Unicode | `--ascii` fallback |
|---|---|---|
| Story steps | `①` `②` `③` `④` `⑤` | `(1)` `(2)` `(3)` `(4)` `(5)` |
| Single site | `▸` | `>` |
| Trigger pointer | `◂ here` | `<-- here` |
| Separator in summaries | `·` | `-` |

- Line numbers are right-aligned to the widest number in the diagnostic; the source column and the label column are aligned across all steps.
- Color (when enabled): `STOP` red, `WARN` yellow, `HINT` cyan, the `◂ here` pointer bold, the code `MOVE-01` dim. Everything remains readable without it.
- Sources in other files print as `lib/math.src:3:5` in the step's location instead of a bare line number.

### 16.4 Severities

| Word | Meaning | Stops the build? |
|---|---|---|
| `STOP` | A rule was broken. | Yes |
| `WARN` | Legal but suspicious. | Only with `--strict` |
| `HINT` | A suggestion or a translation. | No |

### 16.5 Gallery

#### `MOVE-01` · use after move

```
STOP  MOVE-01  main.src:11:10
use of moved value `name`

   `name` was handed to consume() on line 10, so it isn't yours anymore.

   ①   8  let mut name = "Ada".own();   born: `name` owns a String
   ②  10  consume(name);                moved: consume() takes ownership
   ③  11  peek(&name);                  used again  ◂ here

   try:  lend it         consume(&name);          (and make consume take &String)
   or:   give a copy     consume(name.clone());
   or:   use `name` before ②, not after

   learn: lc explain MOVE-01
```

#### `MOVE-02` · moved inside a loop

```
STOP  MOVE-02  main.src:6:17
`s` is moved on one pass of the loop and used again on the next

   consume(s) takes ownership, so the second pass has nothing left to hand over.

   ①  3  let s = "x".own();     born outside the loop
   ②  5  for (i : 0..3) {       this body runs more than once
   ③  6      consume(s);        moved on the 1st pass  ◂ here

   try:  give each pass its own copy   consume(s.clone());
   or:   lend instead of give          consume(&s);

   learn: lc explain MOVE-02
```

#### `MOVE-03` · moving out from behind a reference

```
STOP  MOVE-03  main.src:2:12
can't take ownership of something you're only borrowing

   `v` is a &Vec<String>: you may look, not take. Returning v[0] would hand out
   a String that the Vec still owns.

   ①  1  fn grab(v: &Vec<String>) -> String {   `v` is a loan, not an owner
   ②  2      return v[0];                       takes ownership  ◂ here

   try:  copy it          return v[0].clone();
   or:   return a loan    fn grab(v: &Vec<String>) -> &String { return &v[0]; }

   learn: lc explain MOVE-03
```

#### `LOAN-01` · changing something that's being looked at

```
STOP  LOAN-01  main.src:5:5
`v` is changed while something is still looking at it

   `first` holds a shared loan on `v`. push() needs exclusive access and may move
   the buffer, which would leave `first` pointing at freed memory.

   ①  4  let first = &v[0];         loan opens: `first` looks into `v`
   ②  5  v.push(2);                 exclusive access needed  ◂ here
   ③  6  println("{}", first);      loan still needed here, so it can't end sooner

   try:  finish with `first` first      move line ③ above line ②
   or:   copy the value out             let first = v[0];            (i32 is copy)
   or:   borrow again after the push    v.push(2); let first = &v[0];

   learn: lc explain LOAN-01
```

#### `LOAN-02` · two writers at once

```
STOP  LOAN-02  main.src:4:13
`score` is borrowed for writing twice at once

   ①  3  let a = &mut score;        first exclusive loan opens
   ②  4  let b = &mut score;        second one requested  ◂ here
   ③  5  *a += 1;                   first loan still needed here

   try:  use one at a time     finish with `a` before creating `b`
   or:   split the data        give each writer its own variable or field

   learn: lc explain LOAN-02
```

#### `LIFE-01` · returning a reference to a local

```
STOP  LIFE-01  main.src:3:12
a reference is leaving the function, but what it points at isn't

   `s` is freed at the closing brace of make_greeting(), so `&s` would point at nothing.

   ①  2      let s = "hi".own();     born: `s` owns the String
   ②  3      return &s;              reference escapes  ◂ here
   ③  4  }                           `s` is freed here; the reference would dangle

   try:  return the String itself   fn make_greeting() -> String { ... return s; }
   or:   return a literal           fn make_greeting() -> &life(static) str { return "hi"; }

   learn: lc explain LIFE-01
```

#### `LIFE-02` · doesn't live long enough

```
STOP  LIFE-02  main.src:4:9
`x` doesn't live as long as the reference to it

   ①  3      let x = 5;              born: `x` lives inside this block
   ②  4      r = &x;                 stored in `r`, which outlives the block  ◂ here
   ③  5  }                           `x` freed here; the reference now dangles
   ④  6  println("{}", r);           `r` used after `x` is gone

   try:  declare `x` next to `r`   (move line ① above the block)
   or:   copy the number           let r: i32; ... r = x;

   learn: lc explain LIFE-02
```

#### `LIFE-03` · can't pick a life

```
STOP  LIFE-03  main.src:1:30
can't tell which input the returned reference comes from

   `pick` takes two references and returns one. Say which one the result borrows from.

   ▸  1  fn pick(a: &str, b: &str) -> &str {      two loans in, one loan out  ◂ here

   try:  tie it to `a`    fn pick<life x, life y>(a: &life(x) str, b: &life(y) str) -> &life(x) str
   or:   tie it to both   fn pick<life x>(a: &life(x) str, b: &life(x) str) -> &life(x) str

   learn: lc explain LIFE-03
```

#### `INIT-01` · might not have a value

```
STOP  INIT-01  main.src:3:15
`y` might not have a value yet

   ①  1  let y: i32;                  declared, no value yet
   ②  2  if (x > 3) { y = 1; }        given a value only when x > 3
   ③  3  println("{}", y);            read here, but the other path never set it  ◂ here

   try:  give it a value up front   let mut y: i32 = 0;
   or:   cover every path           add   else { y = 2; }

   learn: lc explain INIT-01
```

#### `MUT-01` · assigning to a read-only binding

```
STOP  MUT-01  main.src:2:1
`count` is read-only

   ①  1  let count = 0;      declared without `mut`
   ②  2  count += 1;         changed  ◂ here

   try:  make it mutable   let mut count = 0;

   learn: lc explain MUT-01
```

#### `CASE-01` · non-exhaustive `switch`

```
STOP  CASE-01  main.src:14:5
`switch` doesn't cover every case

   `Shape` has 3 variants and this switch handles 2.
   missing:  Dot

   ①   8  copy enum Shape { Circle(f64), Rect(f64, f64), Dot, }   `Shape` is defined here
   ②  14  switch (s) {                                            not exhaustive  ◂ here

   try:  add a case       case Dot: { ... }
   or:   catch the rest   default: { ... }

   learn: lc explain CASE-01
```

#### `TYPE-02` · no silent conversions

```
STOP  TYPE-02  main.src:2:14
no silent conversions here

   `a` is an i32 and `b` wants an i64. Widening is safe, but it still has to be written down.

   ①  1  let a: i32 = 5;       a is i32
   ②  2  let b: i64 = a;       expected i64, found i32  ◂ here

   try:  widen it   let b: i64 = a as i64;

   learn: lc explain TYPE-02
```

#### `UNCK-01` · an unlocked operation outside `unchecked`

```
STOP  UNCK-01  main.src:9:17
this operation needs `unchecked`

   Dereferencing a `raw` pointer is something the compiler can't verify.

   ▸  9  let x = *p;       ◂ here

   try:  wrap it, and say why:
             let mut x = 0;
             unchecked("p came from Heap::into_raw and is still allocated") {
                 x = *p;
             }

   learn: lc explain UNCK-01
```

#### `UNCK-02` · the reason has to be a reason

```
STOP  UNCK-02  main.src:7:5
`unchecked` needs a real reason

   The reason must be a string literal of at least 12 characters saying why this is safe.
   "trust me" is 8 characters. (It also isn't a reason.)

   ▸  7  unchecked("trust me") {       ◂ here

   try:  say what you checked   unchecked("index < len was tested on line 5") {

   learn: lc explain UNCK-02
```

#### `UNCK-03` · blast radius

```
WARN  UNCK-03  main.src:20:5
this `unchecked` block is 23 lines long

   The longer the block, the more places a false claim can hide. Only the lines that
   use an unlocked operation need to be inside it.

   ▸  20  unchecked("grow() guarantees ...") {       ◂ here

   try:  move the safe lines out, keep the risky ones in

   learn: lc explain UNCK-03
```

#### `UNCK-04` · calling a contract without promising it

```
STOP  UNCK-04  main.src:12:13
calling an `unchecked fn` outside an `unchecked` block

   `sum_bytes` has a contract the compiler can't check.
   contract:  "p must point to at least n initialized, readable bytes"

   ①   4  unchecked("...") fn sum_bytes(p: raw u8, n: usize) -> u64     declared with the contract above
   ②  12  let t = sum_bytes(p, 4);                                      called without a promise  ◂ here

   try:  promise it, in your own words:
             unchecked("p is the start of the 4-byte array built on line 10") {
                 t = sum_bytes(p, 4);
             }

   learn: lc explain UNCK-04
```

#### `SYN-01` · conditions need parentheses

```
STOP  SYN-01  main.src:4:8
conditions need parentheses

   ▸  4  if x > 5 {       ◂ here

   try:  if (x > 5) {

   learn: lc explain SYN-01
```

#### `SYN-03` · assignment as a condition

```
STOP  SYN-03  main.src:4:8
assignment used as a condition

   `x = 5` sets x to 5; it doesn't compare. Assignments are statements here, so this
   classic C slip can't sneak through.

   ▸  4  if (x = 5) {       ◂ here

   try:  compare       if (x == 5) {
   or:   assign first  x = 5;
                       if (x > 0) { ... }

   learn: lc explain SYN-03
```

#### `NAME-02` · translating from other languages

```
HINT  NAME-02  main.src:6:5
`unsafe` is spelled `unchecked("reason")` here

   ▸  6  unsafe {       ◂ here

   try:  unchecked("why this is fine") {

   learn: lc explain NAME-02
```

#### `MUT-02` · a warning

```
WARN  MUT-02  main.src:3:9
`total` is `let mut` but never changed

   ▸  3  let mut total = 0;       ◂ here

   try:  let total = 0;
```

### 16.6 Build summary and exit codes

Every run ends with one summary line:

```
BUILD STOPPED   2 stops · 1 warn · 0 hints      nothing was produced
BUILD OK        0 stops · 2 warns · 1 hint      → ./main
```

| `lc` exit status | Meaning |
|---|---|
| 0 | Build succeeded (warnings allowed unless `--strict`). |
| 1 | At least one `STOP` (or a `WARN` under `--strict`). |
| 2 | Usage or I/O error (bad flag, missing file). |
| 70 | (Compiled **program**, not `lc`) the program trapped (§14). |

Under `run`, the compiled program's exit status is forwarded as `main`'s
return value modulo 256, so any value in 0–255 is a normal result — `139` can
mean "returned 139". A program that dies from a signal (a violated `unchecked`
contract, an abort) is therefore reported explicitly by the driver as
`harmony-base: the compiled program was killed by signal N`, and the forwarded
status keeps the shell convention (128 + signal).

### 16.7 Machine-readable formats

**`--format=line`** is one grep-friendly line per diagnostic (for editors, CI logs):

```
main.src:11:10: stop[MOVE-01]: use of moved value 'name'
main.src:5:5: stop[LOAN-01]: 'v' is changed while something is still looking at it
main.src:3:9: warn[MUT-02]: 'total' is `let mut` but never changed
```

**`--format=json`** is one JSON object per diagnostic, including structured fixes that an editor can apply:

```json
{
  "severity": "stop",
  "code": "MOVE-01",
  "title": "use of moved value `name`",
  "summary": "`name` was handed to consume() on line 10, so it isn't yours anymore.",
  "primary": { "file": "main.src", "line": 11, "col": 10 },
  "story": [
    { "step": 1, "role": "born",  "file": "main.src", "line": 8,  "col": 9,  "label": "born: `name` owns a String" },
    { "step": 2, "role": "moved", "file": "main.src", "line": 10, "col": 13, "label": "moved: consume() takes ownership" },
    { "step": 3, "role": "used",  "file": "main.src", "line": 11, "col": 10, "label": "used again", "trigger": true }
  ],
  "fixes": [
    { "label": "lend it",   "edits": [ { "file": "main.src", "line": 10, "col": 13, "len": 4, "with": "&name" } ] },
    { "label": "give a copy", "edits": [ { "file": "main.src", "line": 10, "col": 13, "len": 4, "with": "name.clone()" } ] }
  ],
  "learn": "lc explain MOVE-01"
}
```

Step `role` is one of: `born`, `moved`, `borrowed`, `used`, `mutated`, `dropped`, `declared`, `defined`.

### 16.8 `lc explain`

```
$ lc explain MOVE-01

MOVE-01 · use of moved value

WHAT   A value was used after ownership of it was handed to someone else.
WHY    Every value has exactly one owner. A move transfers that job. The old name
       is left empty, so using it would mean touching memory that may be gone.

BAD    let s = "hi".own();
       consume(s);
       println("{}", s);        // s was given away on the line above

GOOD   consume(s.clone());      // give a copy
       consume(&s);             // lend it (if consume takes &String)

NOTE   Types marked `copy` (integers, bools, chars, small plain structs) are
       duplicated instead of moved, so this error never happens for them.

SEE    Language guide § Ownership and moves
```

### 16.9 Cascade control and limits

- **Type errors suppress ownership analysis** in the same function, so you never get a flood of nonsense moves from a function that doesn't type-check.
- **One report per root cause.** After `MOVE-01` on `name`, further uses of `name` are folded into the same report as an extra line: `also used at lines 14, 17`.
- Diagnostics are sorted by primary location. By default at most **5 stops** are printed, then `…and 3 more stops (use --all)`. Warnings are capped at 10.
- A run with only warnings prints them after a blank line, never before a stop.

### 16.10 Code catalogue

| Code | Sev | Title | Typical trigger | Primary fix |
|---|---|---|---|---|
| `SYN-01` | stop | condition needs parentheses | `if x > 5 {` | add `( )` |
| `SYN-02` | stop | body needs braces | `if (x) y();` | add `{ }` |
| `SYN-03` | stop | assignment used as condition | `if (x = 5)` | use `==` |
| `SYN-04` | stop | missing `;` | `let n = 5` | add `;` |
| `SYN-05` | stop | unexpected token / unbalanced delimiter | stray `)` | fix the delimiter |
| `NAME-01` | stop | unknown name | typo | suggest the closest name |
| `NAME-02` | hint | foreign word translation | `unsafe`, `match`, `null`, ... | use this language's word (§16.11) |
| `NAME-03` | stop | name declared twice in one scope | two `let x` | rename or drop one |
| `NAME-04` | stop | unknown module, export, or import cycle | `import "nope.src";` | fix the path |
| `SHADOW-01` | warn | name shadows an outer one | nested `let x` | rename |
| `TYPE-01` | stop | mismatched types | `let a: i32 = "x";` | convert or fix the type |
| `TYPE-02` | stop | no implicit conversion | `i32` into `i64` | `as`, `.narrow<T>()`, ... |
| `TYPE-03` | stop | condition is not `bool` | `if (n)` | `if (n != 0)` |
| `TYPE-04` | stop | wrong argument count or type | `add(1)` | pass the right arguments |
| `TYPE-05` | stop | invalid `copy` marking | `copy struct` with a `String` field | drop `copy`, or change the field |
| `TYPE-06` | stop | bound not satisfied | `<` on a `T` without `ord` | add the bound |
| `FMT-01` | stop | format string mismatch | `println("{} {}", x)` | match arguments to `{}` |
| `FFI-01` | stop | unknown ABI | `extern "Win64" fn ...` | use the C ABI: `extern "C" fn ...` |
| `CONST-01` | stop | not a compile-time constant | `const A: i32 = compute();` | use a literal, another constant, or a `let` |
| `FLOW-01` | stop | `else` clause falls through | `let x = f() else (e) { };` | end every path with `return`/`break`/`continue`/`trap(...)`/`exit(...)` |
| `FLOW-02` | stop | cannot forward this failure | `Outcome<E>` into a function returning `Outcome<F>` | convert with an explicit block |
| `FLOW-03` | stop | no return type can carry the failure | `else return;` in a function returning `i32` | use an explicit `trap`/`exit` block |
| `MACRO-01` | stop | wrong macro argument count or kind | `{ ... }` passed to `expr`, `a + 1` passed to `ident` | show the parameter kind and the call site (§20.5) |
| `MACRO-02` | stop | macro form/position mismatch | statement macro in expression position, or a missing `return` in `-> expr` | add `-> expr`, use `return`, or call as `#name(...);` |
| `MACRO-03` | stop | expansion depth exceeded (64) | recursive macro cycle | break the cycle |
| `MACRO-04` | stop | invalid pack spread or loop exit | `pack...` outside a call, `break` in an unrolled pack loop | use `for (x : pack)` or `return` |
| `MUT-01` | stop | assigning to a read-only binding | `let x = 1; x = 2;` | `let mut` |
| `MUT-02` | warn | `let mut` never changed | unused `mut` | remove `mut` |
| `MUT-03` | stop | `&mut` of a read-only binding | `&mut x` where `x` isn't `mut` | `let mut` |
| `INIT-01` | stop | might not have a value | partial initialization | initialize on every path |
| `MOVE-01` | stop | use after move | `consume(a); use(a);` | borrow, clone, or reorder |
| `MOVE-02` | stop | moved in a loop | `consume(s)` in a loop | clone or borrow |
| `MOVE-03` | stop | move out from behind a reference | `return v[0];` on `&Vec` | clone or return a reference |
| `MOVE-04` | stop | move one field out of a struct | `let n = p.name;` | `replace`, `clone`, or `self` method |
| `LOAN-01` | stop | write or move while shared-borrowed | `push` with a live `&v[0]` | end the borrow first |
| `LOAN-02` | stop | second exclusive borrow | two `&mut x` alive | one at a time |
| `LOAN-03` | stop | read while exclusively borrowed | `&x` while `&mut x` alive | finish the writer first |
| `LIFE-01` | stop | returning a reference to a local | `return &s;` | return the owner |
| `LIFE-02` | stop | owner doesn't live long enough | ref stored beyond the block | widen the owner's scope |
| `LIFE-03` | stop | can't pick a life (elision failed) | two ref inputs, one out | annotate with `life` |
| `LIFE-04` | stop | body contradicts the `life` signature | returns `y` where `life(a)` was promised | fix the signature or the body |
| `CASE-01` | stop | `switch` not exhaustive | missing variant | add the case or `default` |
| `CASE-02` | warn | unreachable case | duplicate pattern | remove it |
| `DROP-01` | stop | `cleanup` called directly | `x.cleanup();` | use `drop(x)` |
| `DROP-02` | warn | recursive owner without `cleanup` | long-list drop recursion | add an iterative `cleanup` |
| `UNCK-01` | stop | operation needs `unchecked` | `*raw_ptr` | wrap in `unchecked("why")` |
| `UNCK-02` | stop | missing or weak reason | `unchecked("ok")` | write a real reason |
| `UNCK-03` | warn | oversized `unchecked` block (> 10 lines) | big block | shrink it |
| `UNCK-04` | stop | `unchecked fn` called outside `unchecked` | missing promise | wrap in `unchecked("why")` |
| `UNCK-05` | stop | `unchecked` under `--deny-unchecked` | any use | remove it, or build without the flag |
| `UNUSED-01` | warn | unused variable | never read | prefix with `_` or remove |
| `UNUSED-02` | warn | ignored `Maybe`/`Outcome` | `parse(x);` | handle it, or `let _ =` |
| `DEAD-01` | warn | unreachable code | statement after `return` | remove it |
| `STYLE-01` | hint | naming convention | `fn DoThing` | rename to `do_thing` |

### 16.11 Migration hints (`NAME-02`)

When the compiler sees a word from C, C++, Rust, Java, or Go that means something here, it says so instead of printing a bare "unknown name":

| You wrote | It's spelled here |
|---|---|
| `unsafe { }` | `unchecked("reason") { }` |
| `impl X { }` | `methods X { }` |
| `trait Shape { ... }` | `abilities Shape { ... }` (v1 feature; a `NAME-02` hint, not an error) |
| `match x { A => ... }` | `switch (x) { case A: { ... } }` |
| `pub fn` | `export fn` |
| `use foo;` | `import "foo.src";` |
| `loop { }` | `while (true) { }` |
| `null`, `NULL`, `nullptr` | `Maybe<T>` with `Empty` |
| `Option`, `Some(x)`, `None` | `Maybe`, `Has(x)`, `Empty` |
| `Result`, `Ok(x)`, `Err(e)` | `Outcome`, `Good(x)`, `Bad(e)` |
| `Box<T>`, `Box::new(x)` | `Heap<T>`, `heap(x)` |
| `malloc(...)` / `free(p)` | `heap(x)` / nothing: freed at `}` |
| `new X`, `delete p` | `heap(x)` / nothing: freed at `}` (a `NAME-02` hint, not an error) |
| `#define N 8` | `const N: usize = 8;` (or `macro` for code, §20.5) |
| `macro_rules! name { ... }` | `macro name(...) { ... }` (§20.5; `macro` is reserved, not a v1 feature) |
| `panic!("msg")`, `abort()` | `trap("msg")` |
| `.unwrap()` | `.or_trap("msg")` |
| `String::from("x")`, `.to_string()` | `"x".own()` |
| `Type::new()` | `Type::make()` |
| `p->x` | `p.x` |
| `x++`, `x--` | `x += 1;`, `x -= 1;` |
| `c ? a : b` | an `if` / `else` statement |
| `#define N 8` | `const N: usize = 8;` |
| `goto` | loops and functions |
| `'a` (a lifetime tick) | `life(a)` |


---

## 17. Example programs

### 17.1 Hello, FizzBuzz

```c
fn main() {
    println("hello, world");

    for (i : 1..=15) {
        if (i % 15 == 0) {
            println("FizzBuzz");
        } else if (i % 3 == 0) {
            println("Fizz");
        } else if (i % 5 == 0) {
            println("Buzz");
        } else {
            println("{}", i);
        }
    }
}
```

### 17.2 Shapes and `switch`

```c
copy enum Shape { Circle(f64), Rect(f64, f64), Dot, }

fn area(s: Shape) -> f64 {
    switch (s) {
        case Circle(r):  { return 3.14159 * r * r; }
        case Rect(w, h): { return w * h; }
        case Dot:        { return 0.0; }
    }
}

fn main() {
    let shapes = [Shape::Circle(1.0), Shape::Rect(2.0, 3.0), Shape::Dot];
    let mut total = 0.0;
    for (s : shapes) {
        total += area(s);
    }
    println("total area: {:.2}", total);
}
```

Forget a case and you get `CASE-01`, not a silent bug.

### 17.3 A generic stack

```c
struct Stack<T> { items: Vec<T>; }

methods<T> Stack<T> {
    export fn make() -> Stack<T> {
        return Stack { .items = Vec::make() };
    }

    export fn push(&mut self, x: T) {
        self.items.push(x);
    }

    export fn pop(&mut self) -> Maybe<T> {
        return self.items.pop();
    }

    export fn peek(&self) -> Maybe<&T> {       // life elided: tied to &self
        return self.items.last();
    }

    export fn size(&self) -> usize {
        return self.items.len();
    }
}

fn main() {
    let mut s = Stack::make();
    s.push(1);
    s.push(2);
    switch (s.pop()) {
        case Has(x): { println("popped {}", x); }
        case Empty:  { println("nothing there"); }
    }
}
```

### 17.4 A singly linked list

```c
struct Node {
    value: i32;
    next: Maybe<Heap<Node>>;
}

fn push_front(head: Maybe<Heap<Node>>, value: i32) -> Maybe<Heap<Node>> {
    return Has(heap(Node { .value = value, .next = head }));
}

fn sum(head: &Maybe<Heap<Node>>) -> i32 {
    let mut total = 0;
    let mut cur = head;
    while (true) {
        switch (cur) {                   // switching on a & gives you & to the parts
            case Has(node): {
                total += node.value;     // `.` auto-derefs through & and Heap: no `->`
                cur = &node.next;
            }
            case Empty: {
                break;                   // exits the while loop, not the switch
            }
        }
    }
    return total;
}

fn reverse(head: Maybe<Heap<Node>>) -> Maybe<Heap<Node>> {
    let mut prev: Maybe<Heap<Node>> = Empty;
    let mut cur = head;
    while (true) {
        switch (cur) {
            case Has(mut node): {        // by-value binding: `cur` is moved here...
                cur = node.next.take();  // ...and re-initialized here
                node.next = prev;        // `prev` moves into the node
                prev = Has(node);        // `node` moves into prev
            }
            case Empty: {
                break;
            }
        }
    }
    return prev;
}

fn main() {
    let mut list: Maybe<Heap<Node>> = Empty;
    for (i : 1..=3) {
        list = push_front(list, i);
    }
    println("sum = {}", sum(&list));
    list = reverse(list);
    println("sum after reverse = {}", sum(&list));
}                                         // `list` is freed here, node by node
```

`reverse` is the ownership dance in miniature: every node is moved exactly once, and nothing is freed early or twice.

### 17.5 A word iterator (lives plus the `next` protocol)

```c
struct Words<life a> {
    text: &life(a) str;
    pos: usize;
}

methods<life a> Words<life(a)> {
    export fn make(text: &life(a) str) -> Words<life(a)> {
        return Words { .text = text, .pos = 0 };
    }

    // Returns a slice of the ORIGINAL text, not of `self`.
    export fn next(&mut self) -> Maybe<&life(a) str> {
        let bytes = self.text.as_bytes();
        let n = bytes.len();

        while (self.pos < n && bytes[self.pos] == b' ') {
            self.pos += 1;
        }
        if (self.pos == n) {
            return Empty;
        }

        let start = self.pos;
        while (self.pos < n && bytes[self.pos] != b' ') {
            self.pos += 1;
        }
        return Has(&self.text[start..self.pos]);
    }
}

fn main() {
    let text = "the quick brown fox";
    let mut count = 0;
    for (w : Words::make(text)) {         // works because Words has the right `next`
        println("word {}: {}", count, w);
        count += 1;
    }
}
```

No traits anywhere: `for` just looks for `next(&mut self) -> Maybe<T>`.

### 17.6 A generic function with built-in bounds

```c
fn largest<T: copy + ord>(items: &[T]) -> Maybe<T> {
    if (items.len() == 0) {
        return Empty;
    }
    let mut best = items[0];
    for (x : items) {              // x: &T
        if (*x > best) {
            best = *x;
        }
    }
    return Has(best);
}
```

Remove `ord` from the bound and `*x > best` becomes `TYPE-06`.

### 17.7 Error values

See `parse_digit` and `parse_u8` in §14.4: `Maybe` and `Outcome` with `switch`, no exceptions, no `?`.

### 17.8 `unchecked` in its natural habitat: a mini `Vec`

This is the kind of code only a library author writes. Application code gets the safe API.

```c
struct MiniVec<T> {
    ptr: raw mut T;
    len: usize;
    cap: usize;
}

methods<T> MiniVec<T> {
    export fn make() -> MiniVec<T> {
        return MiniVec { .ptr = Raw::null(), .len = 0, .cap = 0 };
    }

    export fn push(&mut self, value: T) {
        if (self.len == self.cap) {
            self.grow();
        }
        unchecked("grow() guarantees cap > len, so slot len is inside our allocation") {
            self.ptr.plus(self.len).write(value);
        }
        self.len += 1;
    }

    export fn get(&self, i: usize) -> Maybe<&T> {
        if (i >= self.len) {
            return Empty;
        }
        unchecked("i < len was checked above and slots 0..len are initialized") {
            return Has(&*self.ptr.plus(i));
        }
    }

    fn grow(&mut self) {
        let mut new_cap: usize = 4;
        if (self.cap > 0) {
            new_cap = self.cap * 2;               // traps on overflow, never wraps
        }
        unchecked("alloc gives room for new_cap Ts; each old slot is moved exactly once, then the old block is freed") {
            let fresh: raw mut T = alloc<T>(new_cap);
            for (i : 0..self.len) {
                fresh.plus(i).write(self.ptr.plus(i).read());
            }
            if (self.cap > 0) {
                dealloc(self.ptr, self.cap);
            }
            self.ptr = fresh;
        }
        self.cap = new_cap;
    }

    fn cleanup(&mut self) {
        unchecked("slots 0..len are initialized and owned by us; each is read out once and dropped, then the block is freed") {
            for (i : 0..self.len) {
                drop(self.ptr.plus(i).read());
            }
            if (self.cap > 0) {
                dealloc(self.ptr, self.cap);
            }
        }
    }
}
```

Why the safe API is safe: `get` returns `Maybe<&T>` with a life tied to `&self`, so calling `push` while holding that reference is `LOAN-01`. The `unchecked` blocks never leak out; their reasons are checkable by reading six lines.

### 17.9 Calling C

```c
extern "C" fn abs(x: i32) -> i32;

fn main() {
    let mut n = 0;
    unchecked("libc abs() is only undefined for i32::MIN and we pass -5") {
        n = abs(-5);
    }
    println("{}", n);
}
```

### 17.10 Famous bugs and who stops them

| C bug | Here | Stopped by |
|---|---|---|
| use-after-free | `consume(s); peek(&s);` | `MOVE-01` at compile time |
| double free | `free(p); free(p);` | impossible: no `free`; ownership is single |
| dangling pointer to a local | `return &local;` | `LIFE-01` |
| iterator invalidation | `for (x : &v) { v.push(1); }` | `LOAN-01` |
| null dereference | `p->x` on `NULL` | no null; `Maybe<T>` + exhaustive `switch` |
| uninitialized read | `int x; use(x);` | `INIT-01` |
| buffer overflow | `a[10]` on a 4-element array | `T-INDEX` trap |
| signed overflow (UB in C) | `INT_MAX + 1` | `T-OVERFLOW` trap |
| `if (x = 5)` | assignment in condition | `SYN-03` |
| switch fallthrough | missing `break` | no fallthrough; exhaustive |
| unspecified evaluation order | `f(i++, i++)` | no `++`; left-to-right |
| implicit narrowing | `char c = 300;` | `TYPE-02` |
| memory leak | forgot `free` | freed at `}` |
| goto fail | brace-less `if` | `SYN-02` |

---

## 18. Formal grammar (EBNF)

```
(* Notation:  "x" literal token · [x] optional · {x} zero or more · (a | b) choice
   ID identifier · INT FLOAT CHAR BYTE STRING literals                              *)

program       = { import } { item } ;
import        = "import" STRING ";" ;

item          = [ "export" ] ( fn_decl | const_decl | struct_decl | enum_decl )
              | methods_block
              | extern_decl ;

const_decl    = "const" ID ":" type "=" expr ";" ;
extern_decl   = "extern" STRING "fn" ID "(" [ params ] ")" [ "->" type ] ";" ;

unck_head     = "unchecked" "(" STRING ")" ;
fn_decl       = [ unck_head ] "fn" ID [ generics ] "(" [ params ] ")" [ "->" type ] block ;

generics      = "<" gparam { "," gparam } ">" ;
gparam        = "life" ID
              | ID [ ":" bound { "+" bound } ] ;
bound         = "copy" | "eq" | "ord" ;

params        = param { "," param } [ "," ] ;
param         = self_param | [ "mut" ] ID ":" type ;
self_param    = [ "mut" ] "self" | "&" [ "mut" ] "self" ;

struct_decl   = [ "copy" ] "struct" ID [ generics ] "{" { field } "}" ;
field         = ID ":" type ";" ;

enum_decl     = [ "copy" ] "enum" ID [ generics ] "{" variant { "," variant } [ "," ] "}" ;
variant       = ID [ "(" type { "," type } ")" ] ;

methods_block = "methods" [ generics ] type "{" { [ "export" ] fn_decl } "}" ;

(* ---------- types ---------- *)
type          = ref_type | raw_type | array_type | slice_type
              | fn_type | path_type ;                       (* fn_type is v1 *)
ref_type      = "&" [ "mut" ] [ life_use ] type ;
raw_type      = "raw" [ "mut" ] type ;
fn_type       = "fn" "(" [ type { "," type } ] ")" "->" type ;
array_type    = "[" type ";" expr "]" ;
slice_type    = "[" type "]" ;                         (* only behind & or raw *)
path_type     = ID { "::" ID } [ "<" targ { "," targ } ">" ] ;
targ          = type | life_use ;
life_use      = "life" "(" ID ")" ;                    (* ID may be `static` *)

(* ---------- statements ---------- *)
block         = "{" { stmt } "}" ;
stmt          = let_stmt | assign_stmt | expr_stmt
              | if_stmt | while_stmt | for_stmt | switch_stmt
              | unchecked_stmt | block
              | "return" [ expr ] ";"
              | "break" ";"
              | "continue" ";" ;

let_stmt      = "let" [ "mut" ] ( ID | "_" ) [ ":" type ] [ "=" expr ] ";" ;
assign_core   = lvalue assign_op expr ;
assign_stmt   = assign_core ";" ;
assign_op     = "=" | "+=" | "-=" | "*=" | "/=" | "%="
              | "&=" | "|=" | "^=" | "<<=" | ">>=" ;
lvalue        = ID | lvalue "." ID | lvalue "[" expr "]" | "*" expr ;
expr_stmt     = expr ";" ;

if_stmt       = "if" "(" expr ")" block [ "else" ( if_stmt | block ) ] ;
while_stmt    = "while" "(" expr ")" block ;
for_stmt      = "for" "(" for_head ")" block ;
for_head      = let_stmt expr ";" assign_core         (* C-style *)
              | ID ":" expr ;                         (* range, collection, or iterator *)

switch_stmt   = "switch" "(" expr ")" "{" { case_arm } "}" ;
case_arm      = ( "case" pattern { "|" pattern } | "default" ) ":" block ;
pattern       = "_"
              | [ "mut" ] ID
              | literal
              | literal "..=" literal
              | path [ "(" pattern { "," pattern } ")" ] ;

unchecked_stmt = unck_head block ;

(* ---------- expressions (lowest to highest precedence) ---------- *)
expr          = range_expr ;
range_expr    = [ or_expr ] ( ".." | "..=" ) [ or_expr ]
              | or_expr ;
or_expr       = and_expr  { "||" and_expr } ;
and_expr      = cmp_expr  { "&&" cmp_expr } ;
cmp_expr      = bor_expr  [ cmp_op bor_expr ] ;        (* non-associative *)
cmp_op        = "==" | "!=" | "<" | "<=" | ">" | ">=" ;
bor_expr      = bxor_expr { "|" bxor_expr } ;
bxor_expr     = band_expr { "^" band_expr } ;
band_expr     = shift_expr { "&" shift_expr } ;
shift_expr    = add_expr  { ( "<<" | ">>" ) add_expr } ;
add_expr      = mul_expr  { ( "+" | "-" ) mul_expr } ;
mul_expr      = cast_expr { ( "*" | "/" | "%" ) cast_expr } ;
cast_expr     = unary_expr { "as" type } ;
unary_expr    = ( "-" | "!" | "~" | "*" | "&" [ "mut" ] ) unary_expr
              | postfix_expr ;
postfix_expr  = primary { call_args
                        | "[" expr "]"
                        | "." ID [ generic_args ] } ;  (* generic_args only if followed by "(" *)
call_args     = "(" [ expr { "," expr } [ "," ] ] ")" ;
generic_args  = "<" targ { "," targ } ">" ;

primary       = literal
              | path [ generic_args ]                  (* generic_args only if followed by "(" *)
              | "(" expr ")"
              | array_lit
              | struct_init
              | "sizeof" "(" type ")"
              | "heap" "(" expr ")"
              | "raw" "(" expr ")" ;
path          = ID { "::" ID } ;
array_lit     = "[" [ expr { "," expr } [ "," ] ] "]"
              | "[" expr ";" expr "]" ;
struct_init   = path "{" [ field_init { "," field_init } [ "," ] ] "}" ;
field_init    = "." ID "=" expr ;
literal       = INT | FLOAT | CHAR | BYTE | STRING | "true" | "false" ;
```

**Parsing notes**

- **One token of extra lookahead** disambiguates `x.narrow<u8>()` from `a.b < c`: `<` begins generic arguments only when the matching `>` is immediately followed by `(`.
- **Struct literals in conditions are unambiguous**, because every condition is parenthesized: `if (p == Point { .x = 1, .y = 2 }) { ... }` parses cleanly. (A small payoff for keeping the C parens.)
- `&` and `*` are decided by position: prefix means borrow/deref, infix means bit-and/multiply.
- `life` and `static` are ordinary identifiers outside the positions shown.

**Checked after parsing (not expressed in the grammar):** `copy` marking validity; `self` only as first parameter of a method; `break` only inside a loop; `..=` requires an end; or-pattern alternatives bind identical names; reason-string length; slices and `str` only behind references.

**Generic-call inference.** When a call to a generic function omits
`generic_args`, the checker infers each type parameter from the argument types:
`id(7)` becomes `id<i32>(7)`, and `max(a, b)` pins `T` from `a` and requires
`b` to agree. An untyped integer/float literal first adopts its default
(`i32`/`f64`) before inference. A parameter that no argument mentions cannot be
inferred, which is a `TYPE-01` stop asking for the explicit arguments. An
explicit `generic_args` list always wins and is checked as before.

---

## 19. Compiler architecture and the backends

### 19.1 Pipeline

| # | Stage | Output | Notes |
|---|---|---|---|
| 1 | Lexer | tokens | Contextual `life`; byte/char literals; nestable block comments. |
| 2 | Parser | AST | Recursive descent, one extra lookahead (§18). Recovers at `;` and `}` to report several syntax errors. |
| 3 | Module loader and name resolution | resolved AST | Handles `import`/`export`; detects cycles; emits `NAME-xx`, including migration hints. |
| 3.5 | **Macro expansion** (future, §20.5) | expanded resolved AST | Scoped AST macros only: expand `#name(...)` after resolution but before checking, with hygienic scopes and provenance for caller-origin `return`/`break`/`continue`. Not in v1. |
| 4 | Type checker | typed AST | Local inference, bounds (`copy`/`eq`/`ord`), conversion rules, format-string checking, `unchecked` gating. |
| 5 | Lowering | CFG IR | Basic blocks; explicit places; moves, copies, borrows, and scope ends as instructions. |
| 6 | Flow analyses | facts and **events** | Definite init, move analysis, liveness, loan analysis, life inference, exhaustiveness. |
| 7 | Drop elaboration | CFG IR with drops | Inserts drops and drop flags for maybe-moved values. |
| 8 | Monomorphization | specialized IR | One instance per generic instantiation. |
| 9 | **LLVM emission** (primary) | `.ll` | See §19.4. Deterministic IR text: stable symbol/type names, no hashes or timestamps. |
| 10 | `llc`/`opt` + system linker | executable | `--emit=llvm` shows the IR; `--emit=c` routes through the secondary C backend instead. |

**The C backend is secondary** (§19.4b): same mapping table semantics, emitted
as C11 and compiled with the host `cc -std=c11 -O2`. It is the portability and
cross-check backend — the differential test runs both and diffs behavior.

### 19.2 Analyses

- **Definite initialization:** forward dataflow; a use is accepted only if the variable is initialized on every incoming path (`INIT-01`).
- **Moves:** forward dataflow computing, per program point, the set of *definitely moved* and *maybe moved* places. Any use of a maybe-moved place is `MOVE-01`; a move inside a loop of a place declared outside it is `MOVE-02`.
- **Liveness:** backward dataflow over references. A reference is live between its creation and its last use.
- **Loans (borrow checking):**
  1. Each `&`/`&mut` expression creates a **loan** `(place, kind, region)`.
  2. A loan's **region** is the set of CFG points where any reference derived from it is live. Regions are solved by constraint propagation from assignments, call signatures (`life` relationships), and returns, to a fixpoint.
  3. Every access (read, write, move, borrow, drop, scope end) is checked against the loans live at that point whose place overlaps (prefix relation on place paths) and whose kind conflicts.
  4. Conflict kind picks the code: `LOAN-01` (write/move vs shared), `LOAN-02` (exclusive vs exclusive), `LOAN-03` (read vs exclusive), `LIFE-02` (scope end vs any live loan), `LIFE-01` (loan flows to a return).
- **Life inference and elision:** each function is checked against its signature; elision (§11.3) is applied during lowering of signatures. Call sites instantiate life parameters with fresh region variables.
- **Exhaustiveness:** the standard pattern-matrix usefulness algorithm; also reports unreachable arms (`CASE-02`).
- **`unchecked` gating:** a type-checker pass that tags each unlocked operation with its required capability and verifies an enclosing `unchecked` block.

### 19.3 Diagnostics are first-class data

Every analysis records **events** with provenance as it works: `born(place, span)`, `moved(place, span, into)`, `borrowed(place, kind, span)`, `used(place, span)`, `dropped(place, span)`. A diagnostic is built by selecting the relevant events and ordering them by **time** (§16.2). This is why the timeline format costs almost nothing extra: the information the checker needed to reach its verdict is exactly the story the reader needs. Design the event log in stage 5 (not as an afterthought); the JSON output and editor fixes then fall out for free. The human-readable *wording* and the `explain` lessons are data, not compiler code (§19.8.7) — the compiler emits structured events only.

### 19.4 LLVM backend (primary)

The primary backend emits **LLVM IR text** (`.ll`), assembled by the system
toolchain. The runtime is linked in as `rt.bc` (built from the same source that
generates `rt.h` for the C backend). `build`/`run` hand the IR to clang on
stdin (`clang -x ir - …`), so no `.ll` file hits the disk by default;
`emit-llvm` still prints the deterministic IR text to stdout.

| Source construct | Emitted LLVM IR |
|---|---|
| `i8`..`i64`, `u8`..`u64`, `isize`, `usize` | `i8`..`i64`, `ptr`-sized ints via the data layout |
| `bool` | `i1` in registers, `i8` in memory |
| `char` | `i32` (one Unicode scalar value) |
| `&T`, `&mut T` | `T*`, `noalias` + (for `&mut`) `nocapture` where the signature proves it; never null by construction |
| `&[T]`, `&str` | `{ T*, i64 }` (pointer + length) |
| `[T; N]` | `[N x T]` (copies by value) |
| `struct` / `enum` | named `%struct` types; an enum is `{ i32 tag, [4 x i8], [payload x i8] }` — the 8-byte tag region puts the payload at byte offset 8, matching `ty_size` (the tag picks the interpretation) |
| `Heap<T>` | the library `Heap` struct is `{ ptr }`; `heap(x)` = `T*` from `lc_alloc(sizeof(T))` (constructed in place when `x` is a literal); freed by drop glue |
| `Maybe<Heap<T>>`, `Maybe<&T>` | a bare pointer, `null` = `Empty` (niche optimization) |
| `a[i]` | `call lc_check_index(i, N, loc)` before the GEP; direct GEP in `unchecked` |
| checked arithmetic | `call {T, i1} @llvm.sadd.with.overflow.*` (etc.) + `lc_trap(T_OVERFLOW, loc)` on the overflow bit |
| `a / b` | zero and `MIN / -1` checks, then exact division |
| `a << n` | range check on `n`, then shift |
| move | `memcpy`-classed register/value handling; the source is dead, no code needed |
| drop with a drop flag | `br` on the flag; drop glue call in its own block |
| `trap(...)` | `call lc_trap(...)`, declared `noreturn` |
| `trap`/`assert`/`unreachable`/`exit` | `lc_trap_msg`/`lc_assert`/`lc_unreachable`/`lc_exit` calls; the stopping three end the block with `unreachable` (a `never`-typed tail satisfies the missing-return check) |
| `print`/`println`/`eprintln` | the compiler parses the format (`FMT-01`) and emits a run of `lc_put_*` calls (literal text, `lc_put_i64`/`lc_put_f64`/… with width/precision); `eprintln` selects fd 2 |
| `unchecked` operation | emitted as the plain IR operation; no extra checks |
| `extern "C" fn` | a plain C-ABI declaration |

**Determinism:** IR bytes are a pure function of the input — stable,
readable symbol names (`module__Type__method`), types emitted in a fixed
order, explicit (non-numerical) block labels, no hashes, no timestamps,
no build paths. The same input compiles to identical `.ll` bytes
(two runs diff clean).

**Self-hosted implementation:** the rewrite's primary backend lives in
`harmony/codegen/llvm/`: `context.hr` owns the deterministic emitter state,
`llx.hr` lowers expressions and statements, and `emit.hr` drives module
and function emission. Its IR is byte-identical to the bootstrap backend's
on the full codegen corpus, including multi-module programs;
`tests/harmony-final/irdiff.py` is the differential gate.

**Deterministic multi-core lowering and code generation.** `emit.hr` first
fixes the sequential function order (free functions, non-generic methods,
then generic instances). It then forks workers over contiguous slices of
that order; each worker inherits the checked program through copy-on-write
and writes its IR chunk to a private `/tmp` file. The parent joins in spawn
order and concatenates the chunks, so PIDs, scheduling, and the worker count
never appear in the emitted IR. For large `build`/`run` jobs each chunk is
also made self-contained (shared preamble plus declarations of sibling
symbols). The default backend parses each chunk with the LLVM C API, runs
`default<O2>` and emits an object entirely in-process; a forked worker owns
each libLLVM instance. Objects are linked with `ld` directly, using the host
crt/libc paths discovered by LLD itself from the host filesystem. No `.ll`
file and no external tool (clang, ld, or a generated link script) is used for
the default path; a self rebuild executes no child process at all.
`--backend=clang` keeps
the previous clang text path for debugging, and `emit-llvm` always prints the
unchanged byte-deterministic IR. Small programs take the single-process path.
The default worker count is three per CPU in the process's affinity mask
(`sched_getaffinity(2)`), capped at 32 workers; `--jobs=1`/`--sequential`
force one worker. Type checking and monomorphization stay sequential because
they share one type table whose ids and first-instantiation order are visible
in the IR.

`extern "C"` is the FFI used for `library/std/llvm.hr`: scalar and pointer
arguments have a direct C ABI mapping, so `LLVMContextRef`/`LLVMModuleRef`
(which are opaque pointers in the C API) cross the boundary as `raw u8`.
Structs cannot cross the boundary, which is why `library/runtime/llvmc.c`
wraps the few multi-argument C API calls. That shim lives with the runtime in
`library/runtime/`, together with the freestanding `rt.c` and the hosted
`hostmain.c` used by the native backend.

### 19.4b C backend (secondary, cross-check)

Emits C11 from the same mapping semantics; run through the host
`cc -std=c11 -O2`. The table is identical to §19.4 read with C types:

| Source construct | Emitted C (11) |
|---|---|
| `i8`..`i64`, `u8`..`u64`, `isize`, `usize` | `int8_t` ... `uint64_t`, `ptrdiff_t`, `size_t` |
| `bool`, `char` | `_Bool`, `uint32_t` |
| `&T`, `&mut T` | `T*` (never null by construction) |
| `&[T]`, `&str` | `struct { T* ptr; size_t len; }` |
| `[T; N]` | `struct { T a[N]; }` (so it copies by value) |
| `struct` | `struct` |
| `enum` | `struct { uint32_t tag; union { ... } as; }` |
| `Heap<T>` | the library `Heap` struct is `{ T* }`; `heap(x)` = `T*` from `lc_alloc(sizeof(T))` (constructed in place when `x` is a literal); freed by drop glue |
| `Maybe<Heap<T>>`, `Maybe<&T>` | a bare pointer, `NULL` = `Empty` (niche optimization) |
| `a[i]` | `a.a[lc_check_index(i, N, loc)]` |
| `a + b` (checked ints) | `__builtin_add_overflow` + `lc_trap(T_OVERFLOW, loc)` |
| `a / b` | zero and `MIN / -1` checks, then `/` |
| `a << n` | range check on `n`, then `<<` |
| move | a struct copy; the source is dead, so no code is needed |
| drop with a drop flag | `if (flag_x) { drop_T(&x); }` |
| `trap(...)` | `lc_trap(...)` declared `_Noreturn` |
| `unchecked` operation | emitted as the plain C operation; no extra checks |
| `extern "C" fn` | a plain C prototype |

Defense in depth: compile the output with `-fwrapv -fno-strict-aliasing -fno-delete-null-pointer-checks -fstack-clash-protection`. The generated code is written so that it does **not** depend on these flags for correctness; they only blunt compiler bugs.

**Runtime library (`rt.h`, a few hundred lines):** allocation wrappers that trap on OOM, `lc_trap`, buffered output, argv access, and a guard-page plus alternate-signal-stack handler that turns stack exhaustion into `T-STACK` instead of a crash. The same runtime source backs `rt.bc` for the LLVM backend and `rt.h` for the C backend. This runtime is **library code, not compiler code**: the compiler emits calls to its hooks, and §19.8.4/§19.8.6 list exactly which pieces live here (allocator, entry, trap formatting, I/O).

**Name mangling:** `module__Type__method`, with monomorphized instances suffixed by a **readable, stable** rendering of their type arguments (e.g. `Stack__push__i32`) — no hashes, so both backends (and two compiler runs) produce identical names.

### 19.5 CLI

```
lc build   <file.harmony>   compile to an executable (LLVM path)
lc run     <file.harmony>   build and run
lc check   <file.harmony>   analyses only, no code generation (fast, editor-friendly)
lc emit-llvm <file.harmony> print the generated LLVM IR
lc emit-c  <file.harmony>   print the generated C (secondary backend)
lc explain <CODE>           long-form lesson for a diagnostic
lc audit   [paths]          list every `unchecked` site
lc fmt     <file.harmony>   canonical formatter (one style, no options)

flags:  --format=pretty|line|json   --all   --strict   --deny-unchecked
        --no-color   --ascii   -o <out>
        -O0 -O1 -O2 -O3 -Os -Oz -Og -Ofast   optimization level (-O2 default)
        -j<N>  --jobs=<N>  --sequential   parallel LLVM workers (default: CPUs)
        --backend=llvm-c|clang             native LLVM-C (default) or clang debug path
```

`-O<level>` selects the LLVM optimization level for code generation and is
passed straight through to the LLVM pipeline, so `-O3` runs the full
aggressive pipeline, `-Os`/`-Oz` optimize for size, `-Og` keeps debug-friendly
output, and `-Ofast` enables fast-math-style assumptions. **`-O2` is the
default** when no level is given (a plain `-O` also means `-O2`). Every level
is honored by `build`, `run`, and `emit-llvm`; `emit-llvm` prints the
*unoptimized* IR (byte-deterministic, what the determinism tests and the
self-host byte-identity milestone compare) unless a level is given explicitly,
in which case it prints the optimized IR.

### 19.6 Test strategy

1. **Accept suite:** valid programs run and their output is compared with expected output.
2. **Reject suite (the soundness suite):** for **every diagnostic code**, at least three programs that *must* be rejected with that exact code. A borrow checker that wrongly accepts is a security bug, not a missing feature.
3. **Snapshot tests** for the rendered diagnostic text (golden files), including `--ascii` and `--format=json`.
4. **Sanitizer fuzzing:** generate random programs with **no** `unchecked`, compile the C output with ASan and UBSan, and treat **any** sanitizer report as a compiler soundness bug.
5. **Differential tests** against a tiny reference interpreter for the safe subset.

### 19.7 Milestones

| M | Deliverable |
|---|---|
| M0 | Lexer, parser, AST pretty-printer, round-trip tests. |
| M1 | Type checker and **LLVM IR emission** for scalars, functions, structs, enums, `switch`: "C with types and traps", with the runtime (`rt.bc`) linked in. (`emit-llvm` is the M1 deliverable; the C backend follows once the language is exercised.) |
| M2 | Ownership: moves, drop elaboration, `Heap`, `String`, `Vec`, `cleanup`. |
| M3 | Borrow checker: shared and exclusive loans, liveness-based. |
| M4 | `life` parameters, elision, structs with references. |
| M5 | Diagnostics renderer (event log, timeline format), `explain`, migration hints, JSON output. |
| M6 | `unchecked`, `raw`, `extern "C" fn`, `lc audit`. |
| M7 | Standard library polish, **C backend as the cross-check backend** (`emit-c` + differential tests), formatter, fuzzing harness, the beginner's book. |

### 19.8 The split rule: compiler vs. library

**The rule.** A feature stays in the compiler only if a bug in it could let
*safe* code corrupt memory, or if it needs syntax or analysis nobody else can
provide. If a buggy version could only produce wrong output, it belongs in the
library or in tooling. **The compiler is the bouncer, not the whole club.**

This is the concrete reading of the feature budget (§2) and the soundness
line (§3.4): the compiler's job is to make the safe subset provably safe; the
convenience, the formatting, the collections, and the diagnostics *wording*
are ordinary auditable code.

Everything below is currently hardcoded, or described elsewhere in this
document as "compiler-known". Under the split rule it moves out. The tables
name, for each item, what the library provides and the tiny intrinsic — if
any — the compiler must keep.

#### 19.8.1 Types defined in the library

| Item | In the library | The compiler keeps |
|---|---|---|
| `Maybe`, `Outcome` | Already ordinary prelude enums | Niche optimization in the C backend |
| `Vec<T>` | The whole implementation, using `unchecked` (`MiniVec` in §17.8 is the template) | Nothing |
| `String` | A wrapper over `Vec<u8>` that guarantees valid UTF-8 | Nothing |
| `Heap<T>` | A struct holding `raw mut T`, with `cleanup`, `into_raw`, `from_raw` | The `heap(x)` intrinsic and the `*h` / auto-deref rule |
| `Range`, `RangeInclusive` | Structs with a `next` method | `a..b` syntax lowers to constructing them |
| `Iter`, `IterMut`, `Drain`, `Chars`, `Bytes` | Structs with `next` | The `for` desugaring |
| `Ordering`, `IoError`, `ParseError` | Plain enums | Nothing |

#### 19.8.2 Free functions

| Item | Implemented as |
|---|---|
| `drop`, `leak` | `fn drop<T>(x: T) {}`, and a `leak` that stores the value somewhere the compiler never frees |
| `swap`, `replace` | Raw read and write inside one tiny `unchecked` block |
| `assert`, `unreachable`, `exit` | `assert` and `unreachable` call `trap`; `exit` wraps libc's `exit` |
| `print`, `println`, `eprintln`, `format` | Runtime halves are library code (see §19.8.6) |
| `sqrt`, `sin`, `pow`, etc. | `extern "C" fn` bindings to libm, with safe wrappers |
| `min`, `max`, `abs` | Ordinary generic functions |

#### 19.8.3 Methods on built-in types

| Item | Library part | Compiler intrinsics underneath |
|---|---|---|
| Integer methods: `try_*`, `wrap_*`, `sat_*`, `pow`, `abs`, `MIN`, `MAX` | All of them | Overflow-detecting add, sub and mul |
| Conversions: `narrow`, `wrap`, `sat`, `approx` | All of them | Range and representability queries |
| `char` | Classification, case mapping, `from_code`, Unicode tables | None |
| `str` | `find`, `contains`, `starts_with`, `chars`, `bytes`, split helpers, the char-boundary trap on slicing | The type `str` itself, because literals need it |
| Slices and `Vec` | `get`, `last`, `contains`, `get_unchecked` | Slice length and bounds-checked `a[i]` |
| `raw` pointers | `plus`, `minus`, `read`, `write`, `is_null`, `Raw::null` | Three intrinsics: pointer offset, move-out read, move-in write |

#### 19.8.4 Allocator and runtime

| Item | Move to the library |
|---|---|
| `alloc` and `dealloc` | A std module over libc `malloc`/`free`. `heap(x)` calls whatever allocator std exposes, so embedded targets can swap it. |
| Out-of-memory policy | Library decides (trap by default). |
| Trap message format, exit status 70, stdout flush | Library. The compiler only emits "call the trap hook with this location." |
| Stack-overflow guard handler (`T-STACK`) | A std runtime module that installs the handler at startup. |
| Program entry: argv, calling `main`, turning its return value into an exit code | A std runtime module. |
| The freestanding memory builtins clang's optimizer may emit (`memset`/`memcpy`/`memmove`/`memcmp`) | Library. A large aggregate initialization or copy is lowered to these libcalls; with no libc linked, the runtime must provide them. |
| `on_trap` hook for freestanding or embedded builds | Library-level hook, which must return `never`. There is no unwinding. |

#### 19.8.5 Protocol implementations

The compiler knows only the **names and shapes** of the hooks it calls. All
implementations live in the library:

| Protocol | Compiler's role | Library's role |
|---|---|---|
| `next(&mut self) -> Maybe<T>` | Desugars `for` | Every collection iterator |
| `cleanup(&mut self)` | Inserts the call at scope end | `Vec`, `String`, `Heap`, files |
| `clone` | Structurally derives it for user types | Hand-written for `String`, `Vec`, `Heap` |
| `eq`, `cmp` | Structurally derives them for user types | Hand-written for `str`, `String`, `Vec` |
| `show(&self, out: &mut Formatter)` (new) | Calls it for `{}` | Hand-written for std types |

A `deref` hook and an `index` hook would also fit this pattern. They would
make `Heap` and `Vec` indexing pure library code, but they let users write
their own smart pointers, so in v0 they would be **std-only**.

#### 19.8.6 Formatting and I/O

| Item | Move to the library |
|---|---|
| Number-to-text (decimal, hex, shortest round-trip floats), padding, precision | Library `fmt` module |
| `Formatter` and the write loop | Library |
| stdin, stdout, stderr, `read_line` | Library over libc |
| Files, paths, environment variables, arguments | Library |

Only format-string **parsing and checking** stays in the compiler, because
there are no variadics or macros (`FMT-01`). If a later version adds restricted
compile-time functions, even that moves out.

#### 19.8.7 Tooling and data (not the compiler core)

| Item | Where it goes |
|---|---|
| Diagnostic wording, `lc explain` pages | Data files, one per code, not strings baked into the binary |
| Migration hints (`NAME-02`) | A data pack. Anyone can add "from Go" or "from Python". |
| Pretty, line and JSON renderers | A separate component consuming structured diagnostics. The compiler emits events only. |
| Lints: `STYLE-01`, `UNUSED-01/02`, `SHADOW-01`, `DEAD-01`, `MUT-02`, `DROP-02` | Pluggable lint passes. They are policy, not soundness. |
| `unchecked` reason-length rule and block-size warning | Lints with thresholds in project config |
| `lc fmt`, `lc audit`, `lc test`, `lc doc` | Separate tools sharing the parser |
| Import path resolution and package fetching | Build tool |

#### 19.8.8 Not in v0, but library from day one

`HashMap` and `Set`, `Deque`, sorting and searching (`sort<T: ord>`), time,
random numbers, JSON, threads and channels (later, on top of a capability
marker — see §20.3 item 4), and Unicode normalization.

#### 19.8.9 What must stay in the compiler

| Item | Reason |
|---|---|
| Lexer, parser, grammar | Syntax |
| Type checker, inference, the `copy`, `eq` and `ord` bound checks | Soundness |
| Move, init, loan, life and exhaustiveness analyses | Soundness |
| Drop elaboration and the calls to `cleanup` | Soundness |
| Overflow, divide-by-zero and shift traps on operators | Operator semantics |
| Arrays, slices, bounds-checked indexing, fat pointers | Soundness |
| Lang items: `str` literal type, `Maybe` niche optimization, `Range` sugar, `for` desugaring, deref rule | Syntax glue |
| `heap(x)` (in-place construction), `sizeof`, layout | Needs backend knowledge |
| `unchecked` gating (`UNCK-01/04`) | Soundness |
| Intrinsics: `trap` plus caller location, the overflow ops, the three pointer ops, `reinterpret` | Can't be written in the language |
| LLVM emission (and, later, C emission) | Backend |

That is about **a dozen intrinsics**, so the compiler core stays small and
everything above it can be audited as ordinary code.

#### 19.8.10 Caveats

- **Repetition without traits or macros.** The numeric method families repeat
  across ten integer types. Either generate the std source from a template at
  build time, or add built-in numeric bounds (`int`, `float`) alongside
  `copy`, `eq` and `ord`. The document's preference: **add the bounds**.
- **The std is the trusted surface.** It uses `unchecked` heavily, so
  `lc audit` (§13.4) should report std and application code **separately**.
- **Lang items must be versioned.** The compiler refers to std types like
  `Maybe`, `Range` and `Heap` by well-known names, so the two ship **pinned
  together**.
- **Speed depends on inlining.** The intrinsics must compile to one-line LLVM
  (or C) operations, or the "library" version of everything gets slower than
  the hardcoded one.

---

## 20. Limitations, open questions, roadmap

### 20.1 Known limitations of v0

| Limitation | Workaround |
|---|---|
| Doubly linked lists, graphs, and trees with parent pointers are awkward | Store nodes in a `Vec` and refer to them by **index**. |
| Self-referential structs are impossible | Use indices or split the struct. |
| No shared ownership (`Rc`-like) | Restructure ownership, or clone. |
| No interior mutability | Pass `&mut` explicitly. |
| No mutable globals | Pass state as parameters. |
| No closures or function values | Write a named `fn`; pass a state struct. (Function pointers arrive in v1, §20.3 item 7.) |
| No user-defined abilities (traits), so no user-defined generic algorithms over behavior (e.g., a generic `sort` with a custom comparison) | Built-in `eq`/`ord` cover common cases. (`abilities` arrives in v1, §20.4.) |
| No outlives bounds on `life` | Restructure; some advanced signatures are rejected. |
| No partial moves | `replace`, `clone`, or consuming methods. (Struct patterns soften this in v1, §20.3 item 6.) |
| A reference to a fat reference (`&&str`, `&&[T]`) collapses to the fat pair | Keep the pair itself (index into a raw slot buffer when a generic container must hold `&str`); nested references need the M2/M3 ownership work. Generic-call unification no longer mis-infers `T = u8` from `&T` against `&str`. |
| No threads | Single-threaded by design in v0. (v1 adds threads with detached-thread support, §20.3 item 4.) |
| No `?`-style propagation | Explicit `switch` on `Outcome`. |
| Long list drops recurse | Hand-written iterative `cleanup` (`DROP-02` warns). |

### 20.2 Deliberately left out of v0

User-defined abilities (`abilities`, v1; `trait` elsewhere), closures, macros, operator overloading, partial moves, `?`/`try`, ternary, threads, shared ownership, interior mutability, mutable globals, unions, `goto`, exceptions, null, implicit conversions, inheritance, and a preprocessor. The planned macro form (§20.5) is a **scoped AST macro, not a preprocessor**; it is future work, not part of v1.

### 20.3 Decisions on the open questions (resolved for v1)

These were open in the v0.3 draft; they are now decided, to be implemented in v1 (v0 scope is unchanged):

1. **Structured reason strings: yes.** `unchecked` reasons may carry a tag from a small vocabulary plus free text, e.g. `unchecked(index_checked, "i < len on line 5")`, so `lc audit` can group sites by kind of promise. The plain-string form stays valid. *Implemented in the final compiler (v1 batch 1).*
2. **`switch` guards: yes.** `case Has(x) if (x > 3):` is accepted; a guarded case still counts for exhaustiveness only when its pattern alone is irrefutable for that variant, and guards never suppress the `default`-required rule on open domains. *Implemented in the final compiler (v1 batch 1).* A guarded `A(x)` covers variant `A`; a guarded `A(5)` does not, and scalar switches still need `default`.
3. **Shared ownership: yes.** v1 adds `Shared<T>` — non-atomic, single-threaded, with `weak` handles — deliberately boring and visibly costly. *Implemented in the final compiler: `library/std/shared.hr` provides `Shared<T>::make`, `clone`, `get`, `downgrade`, explicit `release`, and `Weak<T>::upgrade -> Maybe<Shared<T>>`. Since drop glue is not implemented, owners call `release` explicitly; the last strong owner destroys the value and the last weak owner frees the control block.*
4. **Concurrency: yes, including detached threads.** Threads come with share-style capability markers (ordinary words, not reserved keywords) and **support detached threads** (a thread not tied to a structured scope), not just structured scopes. *Implemented in the final compiler: `library/std/thread.hr` provides `thread::spawn`, `Thread::join`, and `Thread::detach` over `clone(2)`/futex hooks in the runtime. `Share<T>::as_raw()` mints an opaque `ThreadArg`, the capability marker `spawn` requires; `fnptr(f)` supplies the entry address. A thread entry is `fn(raw u8) -> i64`; its result is published by `join`. A detached thread's stack is reclaimed at process exit (it cannot unmap the page it is running on).* No libc or pthread is used, so the freestanding link still works.
5. **Early exit on failure: yes, as an `else` clause on a simple statement.** The original `let x = try parse(s);` spelling was redesigned: there is **no `try` keyword**. Instead `let x = parse(s) else ... ;`, `x = parse(s) else ... ;` and `parse(s) else ... ;` all work. The scrutinee must be a `Maybe` or `Outcome` (other enums keep using `switch`). The success payload binds the target (or is discarded for an expression statement); the failure payload is moved into the optional `(e)` binding, visible only inside the clause block. `else return;` forwards `Bad(e)`/`Empty` and is only legal when the enclosing function returns the same shape with an identical error type. Other exits (`break`, `continue`, `trap(...)`, `exit(...)`) are written out, and every path must exit (FLOW-01). Implemented in the final compiler only; harmony-base stays v0.
6. **Named fields in enum payloads and struct patterns in `switch`: yes.** Both are accepted; struct patterns also soften the "no partial moves" limitation. *Implemented in the final compiler: variants may declare `Variant { field: Type, ... }`; those variants can be constructed with `Enum::Variant { .field = value, ... }` (positional construction still works) and matched with `case Variant { field: pattern, ... }:`. Struct values can be matched the same way with `case Point { x: 0, y: y }:`. Field lists may be partial, literal fields are tested, bound fields become arm bindings, and qualified names and guards work as usual. Unknown field names report `TYPE-02`; a struct pattern on another kind of subject reports `TYPE-01`.*
7. **Function pointers: yes.** `fn(i32) -> i32` is safe and cheap and comes in v1; it is "enough" without closures. *Implemented in the final compiler: `fn(Params) -> Ret` is a structural, `copy`, pointer-sized type. A declared function name coerces to it when the signature matches (`TYPE-01` on mismatch), and calling a function-pointer value checks arity and argument types from the pointer's signature. Function pointers work in locals, fields, arrays and return positions. `fnptr(name)` stays a separate opaque-address intrinsic for thread entries (item 4); harmony-base stays v0.*
8. **Unsuffixed integer literals: `i32`.** C-like and predictable; aggressive `usize` inference for indices is not done.
9. **`unchecked` blocks as expressions: no.** Blocks stay statements; the declare-then-assign pattern keeps the "no trailing-expression magic" rule intact.

### 20.4 Naming

**Decided: the names stay.** `fn`, `Vec`, `String`, `copy`, `Heap`, `make`, and `own` are kept — the v0.3 rename pass settled the vocabulary, and a second rename would only churn the surface without improving reading. The language name is **Harmony** (file extension `.harmony`).

**The trait-like feature is spelled `abilities`**, and `trait` is **not** a keyword:

- The concept matches how the language already speaks: the v0 bounds (`copy`, `eq`, `ord`) are *abilities a type has*, so a user-defined one is declared in an `abilities` block — `abilities Shape { ... }` — parallel to `methods Type { ... }`, and consumed as the same bound syntax (`<T: Drawable + ord>`).
- `trait` (like `impl`, `match`, `Box`) becomes a **recognized foreign word**: writing it earns a `NAME-02` translation hint (`trait Shape { ... }` → `abilities Shape { ... }`), never a bare "unknown name".

Four keyword reservations are **dropped**: `spawn`, `send`, `try`, and (per the rename above) `trait`. Concurrency in v1 uses ordinary names (e.g. `thread.spawn(...)`-style methods), and early exit on failure is an `else` clause; neither needs a keyword. The reserved-for-the-future list in §4.2 is therefore `abilities` `async` `await` `macro`.

### 20.5 Future design: scoped AST macros

**Status: design only — not implemented, not in v1.** `macro` is reserved (§4.2), and `#`/`...` are reserved tokens (§4.4), but no compiler stage expands them yet. This section records the intended semantics so later work does not accidentally drift into text substitution.

#### 20.5.1 What a macro is

A `macro` is **not** text substitution and **not** a runtime function:

1. It is expanded **after parsing and module resolution, before type/borrow checking** — new stage 3.5 in §19.1, between stages 3 and 4.
2. It uses ordinary Harmony syntax (`let`, `if`, `for`, `switch`, `return`) instead of `$` sigils.
3. Because Harmony has no block-expressions (`if`/`switch` are statements, §8), a `-> expr` macro acts as an **inline scoped block** whose `return` yields the value of `#name(...)`.

This is deliberately **not a preprocessor** (§20.2): the input is a resolved AST, not source text, and all checking still happens on the expanded tree.

#### 20.5.2 Syntax forms

```c
// 1. Statement macro (invoked as a statement, ends with `;`)
macro log_if(flag: expr, msg: code) {
    if (!flag) { return; }          // exits this expansion only
    eprintln("{}", msg);
}

// 2. Expression macro (invoked inside any expression)
macro max(a: expr, b: expr) -> expr {
    let mut best = a;
    if (b > best) { best = b; }
    return best;                    // yields the value of `#max(...)`
}

// 3. One-liner expression shorthand (`= <expr>;`)
macro square(x: expr) = x * x;      // sugar for: -> expr { return x * x; }

// 4. Variadic macro (`...`)
macro vec(items: expr...) -> expr {
    let mut v = Vec::make();
    for (x : items) { v.push(x); }  // unrolls at expansion time
    return v;
}
```

Call-site rules:

* **Always prefixed with `#` and parenthesized:** `#max(a, b)`, `#log_if(v, msg);`.
  * Why `#`: `!` is already logical-not (`!flag`), and `#` makes compile-time expansion, lazy `code` arguments, and macro `return` boundaries immediately visible to readers.
  * Parentheses `(...)` are always used (even for `#vec(1, 2, 3)`), avoiding Rust's `[]`/`{}`/`()` guessing game.
* **Statement vs. expression:**
  * Macros without `-> expr` may **only** be called as a statement (`#log_if(...);`), requiring `;` per §4.4.
  * Macros with `-> expr` (or `= expr;`) yield a value and can be used anywhere an expression is valid, including as an expression statement (`#do_thing();`, value discarded).
  * In an expression macro `return;` is `MACRO-02`; in a statement macro `return expr;` is also `MACRO-02`.
* **Modules (§6.7):** macros are private to their file unless marked `export macro ...`. Imported macros are called with their module prefix: `#math::max(a, b)`. A macro and a function may share a name: the `#` prefix selects the macro namespace.
* **Scope:** macro declarations are top-level items only — not inside `fn` or `methods` blocks (MACRO-02).

#### 20.5.3 Parameter kinds

Instead of runtime types, macro parameters declare **how the argument is parsed and when it is evaluated**:

| Kind | Accepts | Evaluated when? | Typical use |
|---|---|---|---|
| `expr` | Any expression | **Once, left-to-right**, at entry to the expansion | `#max(a, b)`, `#square(next())` — kills C's double-evaluation bug |
| `code` | Any expression | **Lazy (on each use)** — skipped if never reached | Guards, assertions, short-circuiting, retries |
| `block` | `{ ... }` statement block | **Lazy (on each use)** | Timing/profiling, scoped wrappers, repeat-N-times |
| `type` | Any type (`i32`, `Vec<u8>`) | Compile-time AST node | Generic helpers, cast/size macros |
| `ident` | A bare identifier | Compile-time AST node | Field names, method names, variable names |

These five words are **contextual**, only meaningful after the `:` in a macro parameter list (§4.2); they are not new reserved keywords.

**Why `expr` vs. `code` matters.** This single distinction eliminates C's two biggest macro traps while keeping things simple:

* In `macro square(x: expr) = x * x;`, calling `#square(next_int())` evaluates `next_int()` **once** into a hidden temporary `__arg0`, then computes `__arg0 * __arg0` (still overflow-checked by Harmony!).
* In `macro log_if(flag: expr, msg: code)`, `flag` is evaluated once up front, while `msg` is only evaluated if execution reaches `eprintln("{}", msg);`. A `code` or `block` parameter used **twice** evaluates its argument **twice** — write a local `let` inside the macro if you need once-only behavior.

**Variadic packs (`...`).** Any parameter kind may end in `...` to accept **0 or more** comma-separated arguments (e.g. `items: expr...`, `conds: code...`). A parameter pack must be the **last** parameter, and can be used in two ways inside the macro:

1. **Compile-time unrolling:** `for (x : pack) { ... }` unrolls the loop body once per argument, in order. This is a *compile-time* `for`, not the runtime loop of §8.5; `break`/`continue` in it are `MACRO-04` because there is no runtime loop to exit.
2. **Call forwarding (`pack...`):** passing `pack...` to a function, `println`/`format`, or another macro splices the arguments in order:
   ```c
   macro debug(fmt: expr, args: expr...) {
       eprintln(fmt, args...);
   }
   ```
   Spread arguments are still checked by `FMT-01` after expansion; a pack spread outside a call is `MACRO-04`.

#### 20.5.4 Semantic rules

**Rule 1: Scoped `return`.** `return` written **in the macro body** exits **only the macro expansion**:

* In a `-> expr` macro, every control-flow path must end in `return <expr>;` (or a diverging call like `trap(...)`), just like a function (`MACRO-02` otherwise).
* In a statement macro, `return;` exits the expansion early; execution continues after the `#macro(...);` call in the caller.
* `return`, `break`, or `continue` written **inside a caller's `code` or `block` argument** keep the **caller's** meaning: they exit the caller's function or loop, running drops cleanly along the way. Implementing this needs provenance on each AST node (macro-origin vs caller-origin), not a textual splice.

**Rule 2: Evaluation order and short-circuiting (§7.5).**

1. Expression macros evaluate **in-place** where `#name(...)` appears — not hoisted above the enclosing statement. So in `ok && #check(x)`, `#check(x)` does **not** run if `ok` is `false`.
2. All `expr` arguments are evaluated strictly **left-to-right** when entering the expansion, bound to invisible hygienic `let` bindings (`__arg0`, `__arg1`, ...). Those names are compiler-generated and cannot be spelled or observed by user code.
3. Calling `#name(a, b)` where an `expr` parameter is non-`copy` (e.g., `String`) moves the value into the expansion, just like a `fn` call. Using that `expr` parameter twice inside the macro body triggers the normal `MOVE-01` diagnostic unless borrowed (`&a`).

**Rule 3: Automatic hygiene.**

* **No variable capture:** locals declared inside a macro (like `best` in `#max` or `v` in `#vec`) live in the macro's own hygiene scope. They cannot shadow, overwrite, or be read by caller code — and caller variables inside `code`/`block` arguments resolve in the **caller's** scope.
* **Module-scoped names:** functions, types, and `const`s named in a macro body (like `Vec::make()`) resolve in the **macro's defining module**, even if the caller did not import them. This follows from resolving names at definition time (or carrying module provenance), not from the caller's scope.
* **No token pasting:** there is no `##` identifier gluing or stringification (`#x`). If you need a name, pass an `ident`.

**Rule 4: Safety and `unchecked` preservation (§13).** Macros have **zero** special safety privileges:

* Expanded code goes through full type inference, move/borrow/`life` checking, bounds checks, overflow traps, and `FMT-01` format checking.
* A macro **cannot** hide `unchecked` operations from callers without writing an explicit `unchecked("...") { ... }` block inside the macro body — and `harmony audit` still flags that site, noting both the macro definition and the call site.

**Rule 5: Expansion limits.** Macros may call other macros, up to a fixed expansion depth of **64** to prevent infinite expansion (`MACRO-03`).

#### 20.5.5 Examples in action

Short-circuiting with `code...`:

```c
macro all_true(conds: code...) -> expr {
    for (c : conds) {
        if (!c) { return false; }   // exits #all_true immediately
    }
    return true;
}

// step2() is never called if step1() returns false
if (#all_true(ready, step1(), step2())) {
    println("go");
}
```

Scoped timing with `block`:

```c
macro timed(label: expr, body: block) {
    let t0 = clock::now_ms();
    body;                           // runs caller's block in place
    let dt = clock::now_ms() - t0;
    println("[{}] {} ms", label, dt);
}

#timed("parse", {
    let ast = parse(&src);
    check(&ast);
});
```

Safe checked unwrap or fallback (`code` avoids evaluating the fallback unnecessarily):

```c
macro or_else(opt: expr, fallback: code) -> expr {
    switch (opt) {
        case Has(v): { return v; }
        case Empty:  { return fallback; }
    }
}

let user = #or_else(find_user(id), load_default_user());
```

Compile-time field access with `ident`:

```c
macro swap_field(a: expr, b: expr, field: ident) {
    swap(&mut a.field, &mut b.field);
}

#swap_field(&mut p1, &mut p2, x);
```

#### 20.5.6 Grammar extension (fits §18 EBNF)

```ebnf
item          = ... | [ "export" ] macro_decl ;

macro_decl    = "macro" ID "(" [ mparams ] ")" macro_body ;
mparams       = mparam { "," mparam } [ "," ] ;
mparam        = ID ":" mkind [ "..." ] ;
mkind         = "expr" | "code" | "block" | "type" | "ident" ;
macro_body    = [ "->" "expr" ] block
              | "=" expr ";" ;

(* Call sites *)
stmt          = ... | macro_stmt ;
macro_stmt    = "#" path "(" [ margs ] ")" ";" ;
primary       = ... | macro_expr ;
macro_expr    = "#" path "(" [ margs ] ")" ;

margs         = marg { "," marg } [ "," ] ;
marg          = ( expr | type | block ) [ "..." ] ;
```

*(In `marg`, an `ident` is already valid `expr`/`type` syntax; the expander validates that the argument matches the declared `mkind` and reports `MACRO-01` otherwise.)* The lexer must gain `#` and `...` tokens (§4.4); `->` (Arrow) already exists.

#### 20.5.7 Diagnostics

| Code | Sev | Trigger | Primary hint / fix |
|---|---|---|---|
| `MACRO-01` | stop | Wrong macro argument count or kind (e.g. `{ ... }` passed to `expr`, or `a + 1` passed to `ident`) | Show expected parameter `kind` and call site |
| `MACRO-02` | stop | Macro form/position mismatch (statement macro in expression position, `-> expr` missing `return`, `return` without a value in `-> expr`, macro declared inside a block) | Add `-> expr`, use `return`, or call as `#name(...);` |
| `MACRO-03` | stop | Macro expansion exceeded max depth (64) | Break recursive macro cycle |
| `MACRO-04` | stop | `pack...` spread outside a call, or `break`/`continue` in unrolled `for (x : pack)` with no enclosing runtime loop | Use `for (x : pack)` or `return` |
| `NAME-02` | hint | `#define` or `macro_rules!` written | Suggest `const` or `macro name(...) { ... }` |

When a **type or borrow error** happens inside expanded code, the timeline diagnostic (§16.2) adds one context step at the top:

```text
   ①  14  let m = #max(count, "hi");     expanded from macro `max`
   ②   3      if (b > best) {            expected i32, found &str  ◂ here
```

---

## 21. Appendix: C to this language cheat sheet

| In C | Here | Note |
|---|---|---|
| `int x = 5;` | `let mut x: i32 = 5;` | Immutable unless `mut`. |
| `const int x = 5;` | `let x = 5;` | Immutable is the default. |
| `#define N 8` | `const N: usize = 8;` | Typed, scoped. |
| `int a[4] = {1,2,3,4};` | `let a = [1, 2, 3, 4];` | Bounds-checked. |
| `struct P { int x; int y; };` | `struct P { x: i32; y: i32; }` | Fields declared `name: type;`. |
| `(struct P){ .x = 1, .y = 2 }` | `P { .x = 1, .y = 2 }` | Same designated-init feel. |
| `p->x` / `p.x` | `p.x` | One syntax; auto-deref. |
| `T *p = &x;` | `let p = &x;` / `&mut x` | Shared or exclusive. |
| `*p` | `*p` | Deref. |
| `NULL` | `Maybe<T>` / `Empty` | The compiler forces you to check. |
| `malloc` + `free` | `heap(expr)` | Freed at the owner's `}`. |
| `realloc`-based growing buffer | `Vec<T>` | Push, pop, indexed. |
| `char *s` | `&str` / `String` | UTF-8, length-carrying. |
| `strcpy`, `strcat` | `s.push_str(t)` | Cannot overflow. |
| `x++` | `x += 1;` | No `++`. |
| `c ? a : b` | `if (c) { r = a; } else { r = b; }` | Statements, not expressions. |
| `switch` with `break`s | `switch` with braced `case`s | No fallthrough; exhaustive. |
| `goto` | loops, functions | None. |
| `union` | `enum` with payloads | Tagged, so you can't read the wrong one. |
| `void *` | generics `T` | Type-safe. |
| `memcpy(&b, &a, n)` | `let b = a;` (copy types) / `a.clone()` | Moves for owning types. |
| `printf("%d\n", x)` | `println("{}", x);` | Format string checked at compile time. |
| `assert(c)` | `assert(c)` | A trap in every build mode. |
| `exit(1)` | `exit(1)` | Same. |
| `abort()` / UB | `trap("msg")` | Defined, with a message. |
| `extern int abs(int);` | `extern "C" fn abs(x: i32) -> i32;` | Calls need `unchecked("...")`. |
| "trust me, I'm a programmer" | `unchecked("a real reason") { }` | The compiler wants it in writing. |

---

*End of document. Conceptual design v0.3.3 (decisions resolved for v1). Nothing here is fully built yet; that is both the risk and the fun.*
