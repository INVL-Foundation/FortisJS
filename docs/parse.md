
# `parse.js` Module

This module provides the `_parse` function and relies on the `core/is.js` file. It allows you to validate and coerce data into specific types. It supports standard primitives, complex objects, and specialised TypedArray structures, featuring advanced handling for BigInt parsing, including scientific notation support and Banker's rounding.

## Table of Contents
1. [Internal Logic](#internal-logic)
2. [Configuration](#configuration)
3. [API Usage](#api-usage)
4. [Examples](#examples)

## Internal Logic
**Banker's Rounding**\
The parser implements **Banker's Rounding** (round half to even) via `_roundBigInt`. This minimizes cumulative rounding errors by rounding to the nearest even number when a value is exactly at the midpoint (.5).

**BigInt & Multi-Integer Parsing**
The `_toMultiInt` function manages the conversion of strings, numbers, and other types into specific integer bit-depths (e.g., `i8`, `u32`, `i128`).

- **Scientific Notation**: Supports strings like `1.5e10`.
- **Hex/Binary/Octal**: Automatically handles `0x`, `0b`, and `0o` prefixes.
- **Range Validation**: Uses `is.js` to ensure the resulting value fits within the target type's bit-range.

**Smart TypedArray Coercion**
The `_smartArray` helper handles complex conversions into TypedArray formats:

- **Alignment Correction**: If a buffer is provided with an offset that doesn't match the element size, it automatically copies the data to a new aligned buffer.
- **String Encoding**: Converts strings to UTF-8 `Uint8Array` automatically.
- **Mixed Arrays**: Iterates through standard arrays to coerce each element to the target type (handling `BigInt` truncation and scientific notation within the array).

## Configuration
The `_configs` object defines how each type is handled during coercion:

| Category | Supported Types |
| :--- | :--- |
| **Primitives** | `string`, `number`, `float`, `bool`, `symbol`, `null`, `undefined` |
| **Functions** | `fn`, `arrowFn` |
| **Integers** | `int`, `i8`, `i16`, `i32`, `i64`, `i128`, `u8`, `u16`, `u32`, `u64`, `u128`, `bigInt`, `safeInt` |
| **Buffers** | `arrayBuffer`, `i8Array`, `i16Array`, `i32Array`, `i64Array`, `u8Array`, `u8ClampedArray`, `u16Array`, `u32Array`, `u64Array`, `f16Array`, `f32Array`, `f64Array` |
| **Objects** | `date`, `url`, `obj` |

## API Usage
All exported functions in the `_parse` object follow a standard signature:

```javascript
_parse[type](input, coerce = false, asObject = false, customErr = '', debug = false)
```

**Parametres**
1. `input` `(any)`: The value to parse or validate.
2. `coerce` `(boolean)`: If true, the parser attempts to convert the input into the target type if it doesn't already match.
3. `asObject` `(boolean)`:
    - If `false` (default): Returns the raw value or throws a `TypeError`.
    - If `true`: Returns a Result Object: `{ error: boolean, message: string, result: any }`.
4. `customErr` `(string)`: An optional override for the error message.
5. `debug` `(boolean)`: If `true`, `console.warn` will trigger on internal parsing failures.

## Examples
```javascript
// Simple validation (throws if not a u8)
const val = _parse.u8(255); 

// Coercion with Result Object
const status = _parse.i32("123.45", true, true);
// Output: { error: false, message: "", result: 123 }

// Handling scientific notation to BigInt
const bigVal = _parse.i64("1.2e3", true);
// Output: 1200n
```