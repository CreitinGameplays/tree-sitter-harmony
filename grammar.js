// Harmony v0.3.3 + v1 Tree-sitter grammar.
// Based on §18 (Formal grammar / EBNF) of the supplied Harmony design document.
// This is a syntax grammar: ownership, typing, exhaustiveness, and borrow checking
// remain semantic/compiler analyses and are intentionally not encoded here.

const PREC = {
  CALL: 16,
  UNARY: 15,
  CAST: 14,
  MULTIPLICATIVE: 13,
  ADDITIVE: 12,
  SHIFT: 11,
  BIT_AND: 10,
  BIT_XOR: 9,
  BIT_OR: 8,
  COMPARE: 7,
  LOGICAL_AND: 6,
  LOGICAL_OR: 5,
  RANGE: 4,
};

const commaSep1 = (rule) => seq(rule, repeat(seq(",", rule)), optional(","));
//const commaSep1NoTrailing = (rule) => seq(rule, repeat(seq(",", rule)));

export default grammar({
  name: "harmony",

  extras: ($) => [/[\s\uFEFF\u2060\u200B\u00A0]/, $.line_comment, $.doc_comment, $.block_comment],

  word: ($) => $.identifier,

  conflicts: ($) => [
    // After a postfix expression, `<` can open generic `type_arguments`
    // (`f<T>(x)`) or continue as a comparison operator (`a < b`). The parser
    // must keep both stacks: the type-arguments branch dies unless it is
    // followed by `(...)`, the comparison branch dies if it is.
    [$.postfix_expression, $.unary_expression],
    // After a type path, `<` can open generic `type_arguments` (`as Vec<i32>`)
    // or be a comparison in an enclosing expression (`[T; n as U < v]`).
    [$.type_path],
    // `x[i]` after an identifier can be an assignment target (`x[i] = v;`)
    // or an index expression statement (`x[i];`). GLR picks once `=` or `;` shows up.
    [$.lvalue, $.path_expression],
    // `case x:` — the identifier can be a binding pattern or the head of a
    // (possibly qualified) variant pattern. Both complete; GLR keeps both.
    [$.binding_pattern, $.path_expression],
    // `#name(...);` is both a macro statement and a macro expression used as
    // an expression statement; GLR keeps both and the trailing `;` resolves.
    [$.macro_statement, $.macro_expression],
    // A macro argument may be an expression or a type; both start with a path.
    [$.type_path, $.path_expression],
  ],

  rules: {
    source_file: ($) => seq(repeat($.import_declaration), repeat($.item)),

    item: ($) => choice(
      $.exported_item,
      $.function_declaration,
      $.constant_declaration,
      $.struct_declaration,
      $.enum_declaration,
      $.methods_block,
      $.extern_function_declaration,
      // Future (§20.5): scoped AST macros and reserved-for-future words are
      // parsed so editors can highlight them before the compiler implements
      // them. They are documented as design-only, not v1 features.
      $.macro_declaration,
      $.reserved_keyword,
    ),

    exported_item: ($) => seq(
      "export",
      choice(
        $.function_declaration,
        $.constant_declaration,
        $.struct_declaration,
        $.enum_declaration,
        $.methods_block,
        $.extern_function_declaration,
        $.macro_declaration,
      ),
    ),

    // Reserved-for-future words (§4.2). Kept as items so they highlight as
    // keywords even though no compiler stage accepts them yet.
    reserved_keyword: ($) => choice("abilities", "async", "await", "macro"),

    import_declaration: ($) => seq("import", $.string_literal, ";"),

    // v1: the reason may carry a tag: `unchecked(index_checked, "i < len")`.
    unchecked_header: ($) => seq(
      "unchecked", "(",
      optional(seq(field("tag", $.identifier), ",")),
      field("reason", $.string_literal),
      ")",
    ),

    function_declaration: ($) => seq(
      optional($.unchecked_header),
      "fn",
      field("name", $.identifier),
      optional($.generic_parameters),
      "(",
      optional($.parameter_list),
      ")",
      optional(seq("->", field("return_type", $.type))),
      $.block,
    ),

    // A foreign declaration names its ABI: `extern "C" fn name(...) -> T;`.
    // The ABI string is mandatory (docs/harmony.md 6.8); `"C"` is the only
    // ABI the compiler implements, but the grammar stays open to more.
    extern_function_declaration: ($) => seq(
      "extern", field("abi", $.string_literal), "fn", field("name", $.identifier),
      "(", optional($.parameter_list), ")",
      optional(seq("->", field("return_type", $.type))),
      ";",
    ),

    constant_declaration: ($) => seq(
      "const", field("name", $.identifier), ":", field("type", $.type),
      "=", field("value", $.expression), ";",
    ),

    generic_parameters: ($) => seq("<", commaSep1($.generic_parameter), ">"),

    generic_parameter: ($) => choice(
     $.life_parameter,
      seq(
        field("name", $.identifier),
        // Bounds use +; commas separate generic parameters.
        optional(seq(":", $.bound, repeat(seq("+", $.bound)))),
      ),
    ),

    life_parameter: ($) => seq("life", field("name", $.identifier)),

    bound: ($) => choice("copy", "eq", "ord"),

    parameter_list: ($) => commaSep1($.parameter),

    parameter: ($) => choice(
      $.self_parameter,
      seq(
        optional("mut"),
        field("name", $.identifier),
        ":",
        field("type", $.type),
      ),
    ),

    self_parameter: ($) => seq(optional("&"), optional("mut"), "self"),

    struct_declaration: ($) => seq(
      optional("copy"), "struct", field("name", $.identifier),
      optional($.generic_parameters),
      "{", repeat($.field_declaration), "}",
    ),

    field_declaration: ($) => seq(
      field("name", $.identifier), ":", field("type", $.type), ";",
    ),

    enum_declaration: ($) => seq(
      optional("copy"), "enum", field("name", $.identifier),
      optional($.generic_parameters),
      "{", commaSep1($.enum_variant), "}",
    ),

    enum_variant: ($) => seq(
      field("name", $.identifier),
      optional(choice(
        seq("(", commaSep1($.type), ")"),
        // v1: named payload fields — `Circle { radius: f64 }`.
        seq("{", commaSep1($.named_payload_field), "}"),
      )),
    ),

    named_payload_field: ($) => seq(
      field("name", $.identifier), ":", field("type", $.type),
    ),

    methods_block: ($) => seq(
      "methods", optional($.generic_parameters), $.type,
      "{", repeat($.method_declaration), "}",
    ),

    method_declaration: ($) => seq(optional("export"), $.function_declaration),

    // Future (§20.5): scoped AST macros. Syntax only; no compiler support yet.
    macro_declaration: ($) => seq(
      "macro", field("name", $.identifier),
      "(", optional($.macro_parameter_list), ")",
      choice(
        seq("->", "expr", $.block),
        seq("=", $.expression, ";"),
        $.block,
      ),
    ),

    macro_parameter_list: ($) => commaSep1($.macro_parameter),

    macro_parameter: ($) => seq(
      field("name", $.identifier), ":",
      field("kind", $.macro_kind), optional("..."),
    ),

    macro_kind: ($) => choice("expr", "code", "block", "type", "ident"),

    macro_argument_list: ($) => seq(
      "(", optional(commaSep1($.macro_argument)), ")",
    ),

    macro_argument: ($) => seq(
      choice($.expression, $.type, $.block), optional("..."),
    ),

    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    type: ($) => choice(
      $.reference_type,
      $.raw_type,
      $.array_type,
      $.slice_type,
      // v1: first-class function pointer `fn(A, B) -> R`. The compiler parses
      // the same form in type position; a trailing comma is tolerated.
      $.function_type,
      $.type_path,
    ),

    function_type: ($) => seq(
      "fn",
      "(",
      optional(commaSep1($.type)),
      ")",
      "->",
      $.type,
    ),

    reference_type: ($) => seq("&", optional("mut"), optional($.life_use), $.type),

    raw_type: ($) => seq("raw", optional("mut"), $.type),

    array_type: ($) => seq("[", $.type, ";", $.expression, "]"),

    slice_type: ($) => seq("[", $.type, "]"),

    type_path: ($) => seq(
      field("name", $.identifier),
      repeat(seq("::", field("path_segment", $.identifier))),
      optional($.type_arguments),
    ),

    type_arguments: ($) => seq("<", commaSep1($.type_argument), ">"),

    type_argument: ($) => choice($.type, $.life_use),

    life_use: ($) => seq("life", "(", field("name", $.identifier), ")"),

    // -----------------------------------------------------------------------
    // Statements and blocks
    // -----------------------------------------------------------------------

    block: ($) => seq("{", repeat($.statement), "}"),

    statement: ($) => choice(
      $.let_statement,
      $.assignment_statement,
      $.expression_statement,
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.switch_statement,
      $.unchecked_statement,
      $.return_statement,
      $.break_statement,
      $.continue_statement,
      $.macro_statement,
      $.block,
    ),

    // v1: an `else` clause on a simple statement. The final `;` belongs to
    // the statement, keeping the "every simple statement ends with ;" rule.
    else_clause: ($) => seq(
      "else",
      choice(
        seq("return", optional($.expression)),
        "continue",
        "break",
        // `else (e) { ... };` binds the failure payload.
        prec.dynamic(1, seq("(", field("binding", $.identifier), ")", $.block)),
        $.block,
        // `else trap("...");` — a diverging call. Restricted to a direct call
        // so `else (e) { ... };` is not confused with a parenthesized expr.
        seq($.path_expression, $.argument_list),
      ),
    ),

    macro_statement: ($) => seq("#", $.path_expression, $.macro_argument_list, ";"),

    let_statement: ($) => seq(
      "let", optional("mut"),
      field("name", choice($.identifier, "_")),
      optional(seq(":", field("type", $.type))),
      optional(seq("=", field("value", $.expression))),
      optional($.else_clause),
      ";",
    ),

    assignment_statement: ($) => seq($.assignment_core, optional($.else_clause), ";"),

    assignment_core: ($) => seq(
      field("left", $.lvalue),
      field("operator", $.assignment_operator),
      field("right", $.expression),
    ),

    assignment_operator: ($) => choice(
      "=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=",
    ),

    lvalue: ($) => choice(
      $.identifier,
      prec.left(PREC.CALL, seq($.lvalue, ".", $.identifier)),
      prec.left(PREC.CALL, seq($.lvalue, "[", $.expression, "]")),
      seq("*", $.expression),
    ),

    expression_statement: ($) => seq($.expression, optional($.else_clause), ";"),

    if_statement: ($) => seq(
      "if", "(", $.expression, ")", $.block,
      optional(seq("else", choice($.if_statement, $.block))),
    ),

    while_statement: ($) => seq("while", "(", $.expression, ")", $.block),

    for_statement: ($) => seq("for", "(", $.for_header, ")", $.block),

    for_header: ($) => choice(
      // C-style: for (let mut i = 0; i < n; i += 1)
      seq($.let_statement, $.expression, ";", $.assignment_core),
      // Range, collection, or iterator: for (item : collection)
      seq(field("name", $.identifier), ":", $.expression),
    ),

    switch_statement: ($) => seq(
      "switch", "(", $.expression, ")", "{", repeat($.case_arm), "}",
    ),

    case_arm: ($) => seq(
      choice(
        seq("case", $.case_pattern_list),
        "default",
      ),
      // v1: guarded arms — `case Has(x) if (x > 3): { ... }`.
      optional(seq("if", "(", $.expression, ")")),
      ":", $.block,
    ),

    case_pattern_list: ($) => seq($.pattern, repeat(seq("|", $.pattern))),

    pattern: ($) => choice(
      $.wildcard_pattern,
      // Higher dynamic precedence: for a bare `case x:` the reference parser
      // binds the identifier (§8.6: "an identifier (binds)"); the variant
      // reading only wins when it is followed by `(...)`, `{...}` or a `::` path.
      prec.dynamic(1, $.binding_pattern),
      $.literal_pattern,
      $.range_pattern,
      $.variant_pattern,
      $.struct_pattern,
    ),

    wildcard_pattern: ($) => "_",

    binding_pattern: ($) => seq(optional("mut"), field("name", $.identifier)),

    literal_pattern: ($) => $.literal,

    range_pattern: ($) => seq($.literal, "..=", $.literal),

    variant_pattern: ($) => seq(
      field("name", $.path_expression),
      optional(seq("(", commaSep1($.pattern), ")")),
    ),

    // v1: named-field patterns for structs and enum payloads.
    // `case Point { x: 0, y: y }:` / `case Circle { radius: r }:`
    // A bare field name is shorthand for binding it (`Point { x, y }`).
    struct_pattern: ($) => seq(
      field("name", $.path_expression),
      "{", commaSep1($.field_pattern), "}",
    ),

    field_pattern: ($) => seq(
      optional("."),
      field("name", $.identifier),
      optional(seq(":", $.pattern)),
    ),

    unchecked_statement: ($) => seq($.unchecked_header, $.block),

    return_statement: ($) => seq("return", optional($.expression), ";"),

    break_statement: ($) => seq("break", ";"),

    continue_statement: ($) => seq("continue", ";"),

    // -----------------------------------------------------------------------
    // Expressions. Layered rules implement the precedence table in §7.2.
    // -----------------------------------------------------------------------

    expression: ($) => $.range_expression,

    range_expression: ($) => choice(
      prec.left(PREC.RANGE, seq(
        optional(field("left", $.logical_or_expression)),
        field("operator", choice("..", "..=")),
        optional(field("right", $.logical_or_expression)),
      )),
      $.logical_or_expression,
    ),

    logical_or_expression: ($) => prec.left(PREC.LOGICAL_OR,
      seq($.logical_and_expression, repeat(seq("||", $.logical_and_expression)))),

    logical_and_expression: ($) => prec.left(PREC.LOGICAL_AND,
      seq($.comparison_expression, repeat(seq("&&", $.comparison_expression)))),

    comparison_expression: ($) => seq(
      $.bitwise_or_expression,
      optional(seq($.comparison_operator, $.bitwise_or_expression)),
    ),

    comparison_operator: ($) => choice("==", "!=", "<", "<=", ">", ">="),

    bitwise_or_expression: ($) => prec.left(PREC.BIT_OR,
      seq($.bitwise_xor_expression, repeat(seq("|", $.bitwise_xor_expression)))),

    bitwise_xor_expression: ($) => prec.left(PREC.BIT_XOR,
      seq($.bitwise_and_expression, repeat(seq("^", $.bitwise_and_expression)))),

    bitwise_and_expression: ($) => prec.left(PREC.BIT_AND,
      seq($.shift_expression, repeat(seq("&", $.shift_expression)))),

    shift_expression: ($) => prec.left(PREC.SHIFT,
      seq($.additive_expression, repeat(seq(choice("<<", ">>"), $.additive_expression)))),

    additive_expression: ($) => prec.left(PREC.ADDITIVE,
      seq($.multiplicative_expression, repeat(seq(choice("+", "-"), $.multiplicative_expression)))),

    multiplicative_expression: ($) => prec.left(PREC.MULTIPLICATIVE,
      seq($.cast_expression, repeat(seq(choice("*", "/", "%"), $.cast_expression)))),

    cast_expression: ($) => prec.left(PREC.CAST,
      seq($.unary_expression, repeat(seq("as", $.type)))),

    unary_expression: ($) => choice(
      prec(PREC.UNARY, seq(
        choice("-", "!", "~", "*", seq("&", optional("mut"))),
        $.unary_expression,
      )),
      $.postfix_expression,
    ),

    postfix_expression: ($) => choice(
      $.primary_expression,
      prec.left(PREC.CALL, seq(
        field("callee", $.postfix_expression),
        field("arguments", $.argument_list),
      )),
      prec.left(PREC.CALL, seq(
        field("object", $.postfix_expression),
        ".", field("field", $.identifier),
        optional($.type_arguments),
      )),
      prec.left(PREC.CALL, seq(
        field("object", $.postfix_expression),
        "[", field("index", $.expression), "]",
      )),
      // Generic calls: the type argument list is immediately followed by `(...)`.
      // NOTE: no static precedence here. A `prec.left(PREC.CALL, ...)` wrapper
      // would give the `<` shift a higher precedence than the expression-chain
      // reduction, so `a < b` would always be parsed as a generic-call prefix.
      // With equal (0) precedence the shift/reduce conflict falls through to the
      // declared `[$.postfix_expression, $.unary_expression]` conflict, letting
      // GLR keep both stacks. `prec.dynamic` prefers the generic-call reading
      // when both interpretations survive (e.g. `a<b>(x)` vs `a < b(x)`).
      prec.dynamic(1, seq(
        field("callee", $.postfix_expression),
        $.type_arguments,
        field("arguments", $.argument_list),
      )),
    ),

    argument_list: ($) => seq("(", optional(commaSep1($.expression)), ")"),

    primary_expression: ($) => choice(
      $.literal,
      $.path_expression,
      $.parenthesized_expression,
      $.array_literal,
      $.struct_initializer,
      $.sizeof_expression,
      $.heap_expression,
      $.raw_expression,
      // Future (§20.5): `#name(...)` expression macro invocation.
      $.macro_expression,
    ),

    parenthesized_expression: ($) => seq("(", $.expression, ")"),

    path_expression: ($) => seq(
      field("name", $.identifier),
      repeat(seq("::", field("path_segment", $.identifier))),
    ),

    array_literal: ($) => choice(
      seq("[", optional(commaSep1($.expression)), "]"),
      seq("[", $.expression, ";", $.expression, "]"),
    ),

    struct_initializer: ($) => seq(
      $.path_expression,
      "{", optional(commaSep1($.field_initializer)), "}",
    ),

    field_initializer: ($) => seq(
      ".", field("name", $.identifier), "=", field("value", $.expression),
    ),

    sizeof_expression: ($) => seq("sizeof", "(", $.type, ")"),

    heap_expression: ($) => seq("heap", "(", $.expression, ")"),

    raw_expression: ($) => seq("raw", "(", $.expression, ")"),

    macro_expression: ($) => seq("#", $.path_expression, $.macro_argument_list),

    literal: ($) => choice(
      $.float_literal,
      $.integer_literal,
      $.byte_literal,
      $.char_literal,
      $.string_literal,
      "true",
      "false",
    ),

    // -----------------------------------------------------------------------
    // Lexical tokens
    // -----------------------------------------------------------------------

    identifier: (_$) => /[A-Za-z_][A-Za-z0-9_]*/,

    doc_comment: (_$) => token(prec(2, seq("///", /[^\r\n]*/))),

    line_comment: (_$) => token(prec(1, seq("//", /[^\r\n]*/))),

    block_comment: (_$) => token(seq(
      '/*',
      repeat(choice(/[^*]+/, /\*[^\/]/)),
      '*/'
    )),

    string_literal: ($) => seq(
      '"',
      repeat(choice($.escape_sequence, $.string_content)),
      '"',
    ),

    string_content: (_$) => token.immediate(prec(1, /[^"\\\r\n]+/)),

    char_literal: ($) => seq("'", choice($.escape_sequence, $.char_content), "'"),

    byte_literal: ($) => seq("b'", choice($.escape_sequence, $.char_content), "'"),

    char_content: (_$) => token.immediate(/[^'\\\r\n]/),

    escape_sequence: (_$) => token.immediate(seq(
      "\\",
      choice(/[nrt0\\"']/, seq("u{", /[0-9A-Fa-f]+/, "}")),
    )),

    integer_literal: (_$) => token(choice(
      /0[xX][0-9A-Fa-f](?:_?[0-9A-Fa-f])*(?:i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
      /0[oO][0-7](?:_?[0-7])*(?:i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
      /0[bB][01](?:_?[01])*(?:i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
      /[0-9](?:_?[0-9])*(?:i8|i16|i32|i64|isize|u8|u16|u32|u64|usize)?/,
    )),

    float_literal: (_$) => token(prec(1, choice(
      /[0-9](?:_?[0-9])*\.[0-9](?:_?[0-9])*(?:[eE][+-]?[0-9](?:_?[0-9])*)?(?:f32|f64)?/,
      /[0-9](?:_?[0-9])*[eE][+-]?[0-9](?:_?[0-9])*(?:f32|f64)?/,
    ))),
  },
});
