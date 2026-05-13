### Use augment-context-engine / ACE MCP

Use ACE when repository context is needed beyond the currently open file.

Use it for:
- finding where a feature, API, component, route, command, or behavior is implemented
- finding related files, call sites, tests, dependencies, or ownership
- understanding architecture or data flow across multiple modules
- debugging behavior that may involve more than one file
- planning a refactor or feature that touches multiple files
- checking impact before editing shared code
- working in unfamiliar areas of a large repository

Before making non-trivial changes in unfamiliar code, use ACE first to gather relevant context.

Do not use ACE for:
- trivial edits contained in the current file
- formatting-only changes
- writing comments or docs that do not require codebase context
- external library documentation; use Context7 instead



### Code and design

#### Occam's Razor

Do not add unnecessary entities, abstractions, layers, configuration, dependencies, or indirection.

When two solutions provide the same functionality, prefer the simpler one. Avoid over-engineering.

#### Separation of concerns

Separate different responsibilities clearly.

Keep UI, business logic, data access, infrastructure, configuration, and side effects isolated where practical. Parts of the system should communicate through clear interfaces instead of hidden shared state or tangled dependencies.

#### DRY: Don't Repeat Yourself

Every piece of system knowledge should have a single, unambiguous, authoritative representation.

Avoid duplicated logic, rules, schemas, constants, and domain knowledge that can drift over time. However, do not introduce premature abstractions before a repeated pattern is real and stable.

#### High cohesion, low coupling

Keep related logic together and unrelated modules independent.

A module should have a clear purpose. Changes to one module should not require unnecessary changes across the system.

#### Principle of least surprise

Code should behave in a way that matches a reasonable maintainer's expectations.

Avoid misleading names, hidden side effects, surprising defaults, clever control flow, and implicit behavior that makes the system harder to understand.

#### Defensive programming

Do not blindly trust external input, user input, network responses, files, environment variables, third-party APIs, or callers across system boundaries.

Validate data at boundaries. Use assertions or explicit checks to protect important invariants. Prefer failing early and clearly over allowing invalid state to spread.

#### Design by contract

Treat functions, modules, and APIs as contracts.

Make preconditions, postconditions, invariants, expected inputs, outputs, side effects, and error behavior clear through types, validation, naming, tests, or documentation.

Callers should know what they must provide. Implementations should clearly guarantee what they return or change.


翻译成中文