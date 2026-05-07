
# `is-quant.js` Module

This module provides the `_isQuant` range of functions, and is a specialised extension of the library designed for high-performance AI and machine learning applications. It focuses on quantisation - the process of representing numbers with lower precision to save memory and increase processing speeds.

## Table of Contents
1. [Quantised Integers](#quantised-integers)
2. [Small Float Formats (<8-bit)](#small-float-formats-8-bit)
3. [Standard AI Formats (8-bit to 32-bit)](#standard-ai-formats-8-bit-to-32-bit)
4. [Custom Format Validation](#custom-format-validation)

## Quantised Integers
Fast bit-shifting checks to ensure an integer fits within specific bit-widths.

| Function | Description |
| :--- | :--- |
| `q4(v)` | **4-bit Signed**: Validates integers from -8 to 7. |
| `q6(v)` | **6-bit Signed**: Validates integers from -32 to 31. |
| `q8(v)` | **8-bit Signed**: Validates integers from -128 to 127. |
| `q16(v)` | **16-bit Signed**: Validates integers from -32,768 to 32,767. |
| `q32(v)` | **32-bit Signed**: Alias for standard `i32` validation. |

## Small Float Formats (<8-bit)
These formats are commonly used in cutting-edge model compression (like QLoRA), and use pre-calculated Lookup Tables (LUTs) for `O(1)` validation speed.

| Function | Description |
| :--- | :--- |
| `nf4(v)` | **4-bit NormalFloat**: The specialized format used in QLoRA. |
| `f4_E2M1` | **4-bit float**: 2 exponent bits, 1 mantissa bit (with Infinity). |
| `f4_E3M0` | **4-bit float**: 3 exponent bits, 0 mantissa bits. |
| `f5_E2M2 / E3M1 / E4M0` | **5-bit** float variants (OCP and IEEE styles). |
| `f6_E2M3 / E3M2` | **6-bit** float variants. |
| `f7_E2M4 / E3M3 / E4M2` | **7-bit** float variants. |

## Standard AI Formats (8-bit to 32-bit)
Checks for the industry-standard formats used by NVIDIA, Google (TPU), and ARM hardware.

| Function | Name | Description |
| :--- | :--- | :--- |
| `f8_E4M3` | **FP8 (OCP)** | Used in H100 GPUs; high precision, no Infinity. |
| `f8_E5M2` | **FP8 (IEEE)** | Used in H100 GPUs; higher dynamic range, supports Infinity. |
| `bf16(v)` | **Bfloat16** | Google's "Brain Float"; same range as FP32 but less precision. |
| `f16_IEEE(v)` | **Half Precision** | Standard 16-bit float used in most deep learning frameworks. |
| `tf32(v)` | **TensorFloat-32** | NVIDIA's internal format; 8 exponent bits, 10 mantissa bits. |
| `f32_IEEE(v)` | **Single Precision** | Standard IEEE 754 32-bit float. |

## Custom Format Validation
The library exposes internal logic to check any arbitrary floating-point configuration.

#### **`_genLUTSmall(width, expBits, manBits, bias, mode)`**
Generates a `Float32Array` lookup table (LUT) for formats ≤16 bits. This is the engine behind the high-speed `f4` through `f8` checks.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `width` | `number` | Total bits (e.g., `8` for an 8-bit float). |
| `expBits` | `number` | Width of the exponent field (controls range). |
| `manBits` | `number` | Width of the mantissa field (controls precision). |
| `bias` | `number` | The exponent bias value. |
| `mode` | `string` | Handles `NaN` & `Infinity` encoding logic for the generated LUT format: `'ieee'`, `'nan_only'`, `'separate'`, `'none'`, or `'ocp'`. Defaults to `ieee`. |

#### **`_isBigQValid(value, format)`**  
Validates if a number is representable in a format defined by custom bit allocations using `BigInt` precision. Ideal for formats >16 bits (like `bf16` or `tf32`) where a LUT would be memory-prohibitive.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `value` | `number` / `bigint` | Input numeric value to be checked. |
| `format` | `Object` | Config descriptor for the quantisation format. |
| `format.expBits` | `number` | Number of bits for the exponent (controls range). |
| `format.manBits` | `number` | Number of bits for the mantissa (controls precision). |
| `format.bias` | `number` | The exponent offset (defaults to IEEE standard $2^{expBits-1} - 1$). |
| `format.mode` | `string` | How the function handles specific bit patterns for `NaN` or `Infinity`. Possible options are `ieee`, `nan_only`, `separate`, and `none`. Defaults to `ieee`. |

## Internal Performance Optimisations
To ensure these checks don't slow down AI inference pipelines, the script utilises:

- **Shared ArrayBuffers**: Reuses fixed buffers for bitwise casting between Floats and Integers.
- **Bit-Length Calculation**: Optimized 53-bit integer counting for mantissa analysis.
- **OCP Mode**: Specialised logic for "Open Compute Project" microscaling (MX) formats which handle "Max Exponent" values differently than standard IEEE 754.
