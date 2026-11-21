; Harmony v0.3.3 + v1 (and future §20.5) — Tree-sitter highlights for Zed.
; Node names and fields in this query are defined by the accompanying grammar.js.

; Comments
(doc_comment) @comment.doc
(line_comment) @comment
(block_comment) @comment

; Strings, characters, bytes, escapes, and numbers
(string_literal) @string
(string_content) @string
(char_literal) @character
(byte_literal) @character
(char_content) @character
(escape_sequence) @string.escape
(integer_literal) @number
(float_literal) @number.float
"true" @boolean
"false" @boolean

; Identifiers and definitions
(identifier) @variable
(function_declaration name: (identifier) @function)
(extern_function_declaration name: (identifier) @function)
; A foreign declaration's ABI string: `extern "C" fn ...` (6.8). The string is
; mandatory, so it is always there.
(extern_function_declaration abi: (string_literal) @string)
(constant_declaration name: (identifier) @constant)
(struct_declaration name: (identifier) @type @type.definition)
(enum_declaration name: (identifier) @type @type.definition)
(enum_variant name: (identifier) @variant)
; v1: named enum payload fields
(named_payload_field name: (identifier) @property)
(field_declaration name: (identifier) @property)
(field_initializer name: (identifier) @property)
(parameter name: (identifier) @variable.parameter)
(generic_parameter name: (identifier) @type.parameter)
(life_parameter name: (identifier) @label)
(let_statement name: (identifier) @variable)
(binding_pattern name: (identifier) @variable)

; Type names — primitive, prelude, and user-defined names share the same grammar node.
(type_path name: (identifier) @type)
(type_path path_segment: (identifier) @type)
; v1: `fn(A, B) -> R` function-pointer type. The `fn` token is highlighted by
; the declaration-keyword rule below; this capture marks the type node itself.
(function_type "fn" @keyword.function)

; Members and method calls
(postfix_expression
  field: (identifier) @property)
(postfix_expression
  callee: (postfix_expression
    field: (identifier) @function.method))

; Variant patterns and qualified paths
(variant_pattern name: (path_expression name: (identifier) @variant))
; v1: struct / named-field patterns
(struct_pattern name: (path_expression name: (identifier) @variant))
(field_pattern name: (identifier) @property)
(path_expression path_segment: (identifier) @namespace)

; v1: the tag in `unchecked(tag, "reason")`
(unchecked_header tag: (identifier) @keyword)

; v1: `else` clauses on simple statements and their failure binding
(else_clause "else" @keyword.control)
(else_clause binding: (identifier) @variable)

; Future (§20.5): scoped AST macros
(macro_declaration name: (identifier) @function.macro)
(macro_parameter name: (identifier) @variable.parameter)
(macro_kind "expr" @keyword)
(macro_kind "code" @keyword)
(macro_kind "block" @keyword)
(macro_kind "type" @keyword)
(macro_kind "ident" @keyword)
(macro_statement "#" @keyword.operator)
(macro_expression "#" @keyword.operator)
(reserved_keyword "abilities" @keyword)
(reserved_keyword "async" @keyword)
(reserved_keyword "await" @keyword)
(reserved_keyword "macro" @keyword)

; `self` is a receiver/builtin variable.
"self" @variable.builtin

; Contextual lifetime syntax: `life` is a keyword only in these productions.
(life_parameter "life" @keyword)
(life_use "life" @keyword)
(life_use name: (identifier) @label)

; Compiler-known generic bounds
(bound "copy" @keyword)
(bound "eq" @keyword)
(bound "ord" @keyword)

; Prelude functions
((postfix_expression
   callee: (postfix_expression
     (primary_expression
       (path_expression name: (identifier) @function.builtin))))
 (#match? @function.builtin "^(print|println|eprintln|format|trap|assert|unreachable|exit|drop|leak|swap|replace|alloc|dealloc|reinterpret|fnptr)$"))

; Intrinsic forms
"heap" @function.builtin
"sizeof" @function.builtin

; Declaration and visibility keywords
"fn" @keyword.function
"let" @keyword
"mut" @keyword.modifier
"const" @keyword
"struct" @keyword
"enum" @keyword
"methods" @keyword
"copy" @keyword.modifier
"export" @keyword
"import" @keyword.import
"extern" @keyword

; Control flow
"if" @keyword.control
"else" @keyword.control
"while" @keyword.control
"for" @keyword.control
"switch" @keyword.control
"case" @keyword.control
"default" @keyword.control
"return" @keyword.control
"break" @keyword.control
"continue" @keyword.control

; Memory and safety
"unchecked" @keyword
"raw" @keyword

; Conversion operator
"as" @keyword.operator

; Operators
"=" @operator
"+=" @operator
"-=" @operator
"*=" @operator
"/=" @operator
"%=" @operator
"&=" @operator
"|=" @operator
"^=" @operator
"<<=" @operator
">>=" @operator
"+" @operator
"-" @operator
"*" @operator
"/" @operator
"%" @operator
"<<" @operator
">>" @operator
"&" @operator
"^" @operator
"|" @operator
"==" @operator
"!=" @operator
"<=" @operator
">=" @operator
"<" @operator
">" @operator
"&&" @operator
"||" @operator
"!" @operator
"~" @operator
".." @operator
"..=" @operator
"..." @operator

; Delimiters and punctuation
"(" @punctuation.bracket
")" @punctuation.bracket
"[" @punctuation.bracket
"]" @punctuation.bracket
"{" @punctuation.bracket
"}" @punctuation.bracket
"," @punctuation.delimiter
";" @punctuation.delimiter
":" @punctuation.delimiter
"." @punctuation.delimiter
"::" @punctuation.delimiter
"->" @punctuation.operator
"_" @variable.special
