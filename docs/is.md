
# `is.js` Module

This module provides the `_is` function and is the basis for the entire library. It handles precise validation for primitives, complex objects, binary data, and modern JavaScript features while accounting for floating-point inaccuracies and memory-safe integer checks.

## Table of Contents
1. [Core Primitives](#core-primitives)
2. [Numbers & Fixed-Width Integers](#numbers-fixed-width-integers)
3. [Collections & Objects](#collections-objects)
4. [Async & Logic](#async-logic)
5. [TypedArrays & Binary](#typedarrays-binary)
6. [Web & DOM](#web-dom)
7. [Utilities](#utilities)

## Core Primitives
Functions for fundamental JavaScript data types.

| Function | Description |
| :--- | :--- |
| `string(v)` | Returns `true` if value is a string. |
| `number(v)` | Checks if value is a number and finite (rejects `NaN` and `Infinity`). |
| `float(v)` | Checks if value is a finite number with a decimal component. |
| `bool(v)` | Validates boolean `true/false`. |
| `fn(v)` | Validates if the value is a function. |
| `symbol(v)` | Checks for Symbol types (handles cross-realm symbols). |
| `registeredSymbol(v)` | Checks if a symbol exists in the global Symbol registry. |
| `null(v)` | Strict check for `null`. |
| `undefined(v)` | Strict check for `undefined`. |

## Numbers & Fixed-Width Integers
Precise checks for various bit-widths and mathematical safety.

| Function | Description |
| :--- | :--- |
| `int(v)` | Checks if the value is a mathematical integer. |
| `safeInt(v)` | Checks if the value is within the "Safe Integer" range (±(2^53 - 1)). |
| `bigInt(v)` | Validates the `bigint` primitive. |
| `i8` / `u8` | Signed/Unsigned 8-bit integer validation (0 to 255 or -128 to 127). |
| `i16` / `u16` | Signed/Unsigned 16-bit integer validation. |
| `i32` / `u32` | Signed/Unsigned 32-bit integer validation. |
| `i64` / `u64` | Signed/Unsigned 64-bit integer (requires BigInt). |
| `i128` / `u128` | Signed/Unsigned 128-bit integer (requires BigInt). |

## Collections & Objects
Advanced validation for data structures and prototype safety.

| Function | Description |
| :--- | :--- |
| `array(v)` | Standard `Array.isArray` check. |
| `obj(v)` | Validates "Plain Objects" (literal `{}` or `Object.create(null)`). |
| `secureObj(v)` | Stricter object check that ensures no prototype pollution or custom classes. |
| `map(v)` / `set(v)` | Validates `Map` and `Set` instances. |
| `weakMap` / `weakSet` | Validates `WeakMap` and `WeakSet` instances. |
| `empty(v)` | Checks if a collection (Array, String, Map, Set, Object) has zero size/length. |

## Async & Logic
Validation for timing, errors, and iteration.

| Function | Description |
| :--- | :--- |
| `date(v)` | Validates a `Date` object and ensures it is not "Invalid Date". |
| `regexp(v)` | Validates Regular Expression (RegEx) objects. |
| `promise(v)` | "Thenable" check to identify Promise-like objects. |
| `asyncFn(v)` | Specifically checks for async function declarations. |
| `temporal(v)` | Detects Proposal-Temporal types (`PlainDate`, `ZonedDateTime`, etc.). |
| `generator(v)` | Checks if the value is an active Generator object. |
| `iterable(v)` | Checks if the value implements the `Symbol.iterator` protocol. |
| `error(v)` | Checks if value is an `Error` instance or has an `Error` tag. |
| `method(v)` | Detects concise methods (rejects classes and standard functions with prototypes). |

## TypedArrays & Binary
Comprehensive support for low-level memory buffers.

| Category | Functions |
| :--- | :--- |
| **Integers** | `i8Array`, `i16Array`, `i32Array`, `i64Array`, `u8Array`, `u8ClampedArray`, `u16Array`, `u32Array`, `u64Array` |
| **Floats** | `f16Array`, `f32Array`, `f64Array` |
| **Buffers** | `arrayBuffer`, `sharedArrayBuffer`, `dataView` |
| **General** | `isView` (True if value is a TypedArray or DataView). |

## Web & DOM
Browser-specific environment checks.

| Function | Description |
| :--- | :--- |
| `element(v)` | Checks if the value is a valid DOM Element (`nodeType 1`). |
| `url(v)` | Validates `URL` objects or URL-like shapes. |
| `formData(v)` | Validates `FormData` instances used in XHR/Fetch. |
| `blob` / `file` | Validates binary `Blob` and `File` objects. |

## Utilities
Specialised logic for math and string safety.

**`multipleOf(v, n)`**
Checks if `v` is a multiple of `n`. It automatically chooses the most efficient algorithm for input types: `Integers`, `BigInts`, and `Floats`.

**`safeString(v)`** Validates whether a string is: well-formed (no lone surrogates, ES2024+), has no null-terminator characters (`\0`), and is normalised (matches the Unicode normalisation form).

**`likeArrowFn(v)`** A heuristic check to identify arrow functions by checking the absence of a prototype and the presence of the `=>` operator in the source string. **Warning**: A very fragile check and is **NOT** recommended to be used in production (i.e. minified scripts).