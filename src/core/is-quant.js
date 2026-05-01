/**
 * @file is-quant.js
 * @description Handles special quantised formats for AI & machine learning.
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

// Global buffers for faster lookups
// For smaller quants
const _isQuant_arrBuf = new ArrayBuffer(4);
const _isQuant_f32SmallView = new Float32Array(_isQuant_arrBuf);
const _isQuant_u32SmallView = new Uint32Array(_isQuant_arrBuf);

// For larger quants
const _isQuant_largeBuf = new ArrayBuffer(8);
const _isQuant_largeView = new DataView(_isQuant_largeBuf);

// Helper functions
const _isQuant_toBits = (f32) => {
    _isQuant_f32SmallView[0] = f32;
    return _isQuant_u32SmallView[0];
};

const _isSmallQValidFast = (input, meta) => {
    if (typeof input !== 'number') return false;
    if (Number.isNaN(input)) return meta.hasNaN;
    const val32 = Math.fround(input);
    return meta.intSet.has(_isQuant_toBits(val32));
};

// Number of bits for a positive BigInt (≤ 53 bits)
const _isQuant_bitLength = (n) => {
    if (n === 0n) return 0;
    let count = 0;
    while (n > 0xffffffffn) { count += 32; n >>= 32n }
    return count + (32 - Math.clz32(Number(n)));
};

// Generate 4-bit NormalFloat (NF4) lookup table
function _genNF4LUT() {
    // Hard-coded constants
    const table = new Float32Array([-1.0, -0.6961928009986877, -0.5250730514526367, -0.39491748809814453, -0.28444138169288635, -0.18477343022823334, -0.09105003625154495, 0.0, 0.07958029955625534, 0.16093020141124725, 0.24611230194568634, 0.33791524171829224, 0.44070982933044434, 0.5626170039176941, 0.7229568362236023, 1.0]);

    // Create set of IEEE 754 bit patterns for exact matching
    const bitsArray = [], valuesArray = []; // No even-mantissa needed for non‑minifloat format
    const intSet = new Set();

    for (let i = 0; i < table.length; i++) {
        const bits = _isQuant_toBits(table[i]);
        intSet.add(bits);
        bitsArray.push(bits);
        valuesArray.push(table[i]);
    }

    return {
        bits: bitsArray,
        values: valuesArray,
        hasNaN: false,
        intSet
    };
}

/**
 * Generate lookup tables for small floating point formats (<16-bits)
 * @param {number} width - Total bit width
 * @param {number} expBits - Number of exponent bits
 * @param {number} manBits - Number of mantissa bits
 * @param {number} bias - Exponent bias
 * @param {boolean} hasNaN - Whether format supports NaN
 * @param {boolean} infinitySupported - Whether format supports infinity
 * @param {boolean} ocpMode - OCP/MX specification, e.g., E4M3 (default = false)
 * @returns {Float32Array} Lookup table mapping integer representation to float32
 */
function _genLUTSmall(width, expBits, manBits, bias, hasNaN, infinitySupported, ocpMode = false) {
    const numValues = 1 << width;
    const lut = new Float32Array(numValues);

    const manMask = (1 << manBits) - 1;
    const maxExp = (1 << expBits) - 1;
    const invManDivisor = 1 / (1 << manBits); // Inverse divisor

    // Pre-calculate powers of 2; remove Math.pow from loop
    const POW2 = new Float32Array(maxExp + 2);
    for (let e = 0; e <= maxExp + 1; e++) POW2[e] = Math.pow(2, e - bias);
    const SB_POW2 = Math.pow(2, 1 - bias);

    for (let i = 0; i < numValues; i++) {
        const sign = (i >> (width - 1)) ? -1 : 1;
        const exp  = (i >> manBits) & maxExp;
        const man  = i & manMask;

        if (ocpMode && exp === maxExp) {
            // OCP E4M3 logic: exp=15 is a normal number unless man=max
            if (man === manMask) {
                lut[i] = hasNaN ? NaN : (sign * POW2[exp] * (1 + man * invManDivisor));
            } else {
                // Formula for normals: sign * 2^(exp-bias) * (1 + man/2^manBits)
                lut[i] = sign * POW2[exp] * (1 + man * invManDivisor);
            }
        } else if (exp === maxExp) {
            // NaN & Infinity handling
            if (infinitySupported && man === 0) {
                lut[i] = sign * Infinity;
            } else {
                // If hasNaN is false, treat this as normal number (extended range)
                lut[i] = hasNaN ? NaN : (sign * POW2[exp] * (1 + man * invManDivisor));
            }
        } else if (exp === 0) {
            // Subnormal numbers (exp is 0)
            // Denormal formula: (-1)^sign * 2^(1-bias) * (man * inv(2^manBits))
            lut[i] = sign * SB_POW2 * (man * invManDivisor);
        } else {
            // Normal numbers
            lut[i] = sign * POW2[exp] * (1 + man * invManDivisor);
        }
    }

    return lut;
}

/**
 * Process floating-point lookup table to generate sorted metadata for quantisation
 * @param {Float32Array} table - Lookup table (mapped bit patterns to float32 values)
 * @param {number} manBits - Number of mantissa bits
 * @returns {Object} Metadata object containing sorted arrays and format properties
 * @returns {Uint32Array|number[]} return.bits - Bit patterns sorted by their float values
 * @returns {Float32Array|number[]} return.values - Float32 values in ascending order
 * @returns {boolean[]} return.even - Whether the mantissa of the value is even (for tie-breaking)
 * @returns {boolean} return.hasNaN - Whether the format supports/contains NaN values
 * @returns {Set<number>} return.intSet - Unique integer bit patterns present in the table
 */
function _genLUTSmallMeta(table, manBits) {
    const bitsArray = [], valuesArray = [], evenMantissa = []; // True if mantissa field is even
    const intSet = new Set();
    let hasNaN = false;

    for (let i = 0; i < table.length; i++) {
        const v = table[i];
        if (Number.isNaN(v)) {
            hasNaN = true;
            continue;
        }
        const bits = _isQuant_toBits(v);
        intSet.add(bits);
        // Unpack mantissa field from the integer bit pattern
        const man = i & ((1 << manBits) - 1);
        // Infinity has man=0, which is even; this is fine for tie‑breaking
        bitsArray.push(bits);
        valuesArray.push(v);
        evenMantissa.push((man & 1) === 0);
    }

    // Sort all three parallel arrays by the float value
    const indices = valuesArray.map((_, i) => i)
        .sort((a, b) => valuesArray[a] - valuesArray[b]);
    return {
        bits: indices.map(i => bitsArray[i]),
        values: indices.map(i => valuesArray[i]),
        even: indices.map(i => evenMantissa[i]),
        hasNaN,
        intSet
    };
}

// Generate lookup tables
const _isQuant_LUT = {
    // Special hardcoded table as per QLoRA
    NF4: _genNF4LUT(),

    // Standard IEEE-style (Inf and NaN supported)
    FP4_E2M1: _genLUTSmallMeta(_genLUTSmall(4, 2, 1, 1, true, true, false), 1), 
    FP4_E3M0: _genLUTSmallMeta(_genLUTSmall(4, 3, 0, 3, true, true, false), 0),
    FP5_E3M1: _genLUTSmallMeta(_genLUTSmall(5, 3, 1, 3, true, true, false), 1),
    FP6_E2M3: _genLUTSmallMeta(_genLUTSmall(6, 2, 3, 1, true, true, false), 3),
    FP8_E5M2: _genLUTSmallMeta(_genLUTSmall(8, 5, 2, 15, true, true, false), 2),

    // OCP / MX compliant
    FP5_E2M2: _genLUTSmallMeta(_genLUTSmall(5, 2, 2, 1, true, false, true), 2), 
    FP5_E4M0: _genLUTSmallMeta(_genLUTSmall(5, 4, 0, 7, true, false, true), 0),
    FP6_E3M2: _genLUTSmallMeta(_genLUTSmall(6, 3, 2, 3, true, false, true), 2),
    FP7_E2M4: _genLUTSmallMeta(_genLUTSmall(7, 2, 4, 1, true, false, true), 4),
    FP7_E3M3: _genLUTSmallMeta(_genLUTSmall(7, 3, 3, 3, true, false, true), 3),
    FP7_E4M2: _genLUTSmallMeta(_genLUTSmall(7, 4, 2, 7, true, false, true), 2),
    FP8_E4M3: _genLUTSmallMeta(_genLUTSmall(8, 4, 3, 7, true, false, true), 3),
};

/**
 * @param {number} value - The numeric value to check
 * @param {Object} quantFormat - The bit-level configuration of target quantisation
 * @param {number} quantFormat.expBits - Number of bits allocated to the exponent
 * @param {number} quantFormat.manBits - Number of bits allocated to the mantissa (fraction)
 * @param {number} [quantFormat.bias] - The exponent bias (defaults to IEEE 754 standard: (2^(expBits - 1)) - 1)
 * @param {boolean} [quantFormat.infinitySupported] - Should target format support Infinity and NaN (defaults to true)
 */
function _isBigQValid(value, {
    expBits,
    manBits,
    bias = (1 << (expBits - 1)) - 1,
    infinitySupported = true
}) {
    // NaN, Infinity & zeroes
    if (Number.isNaN(value)) return infinitySupported && manBits > 0;
    if (!isFinite(value)) return infinitySupported;
    if (value === 0) return true;

    // Absolute value as double bits
    const absVal = value < 0 ? -value : value;
    _isQuant_largeView.setFloat64(0, absVal, true);
    const lo = _isQuant_largeView.getUint32(0, true);
    const hi = _isQuant_largeView.getUint32(4, true);
    const bits = (BigInt(hi) << 32n) | BigInt(lo);

    const exp  = Number((bits >> 52n) & 0x7ffn);
    const mant = bits & 0xfffffffffffffn;

    let F, E;
    if (exp === 0) {
        F = mant;
        E = -1074; // Subnormal double
    } else {
        F = (1n << 52n) | mant;
        E = exp - 1075; // Normal double
    }

    const EBig = BigInt(E);
    const L = _isQuant_bitLength(F);

    // Pre‑compute constants for the target format
    const mBits  = BigInt(manBits);
    const normMin = 1n << mBits;
    const normMax = (1n << (mBits + 1n)) - 1n;
    const subMax  = (1n << mBits) - 1n;
    const maxExp  = infinitySupported
        ? (1 << expBits) - 2
        : (1 << expBits) - 1;

    // Normal numbers
    const shiftNormal = manBits + 1 - L;
    const sBN = BigInt(shiftNormal);

    let M, eBase;
    if (shiftNormal >= 0) {
        M = F << sBN;
        eBase = EBig - sBN;
    } else if ((F & ((1n << -sBN) - 1n)) === 0n) {
        M = F >> -sBN;
        eBase = EBig - sBN;
    }

    // If not representable as normal (non-zero low bits); fall through to subnormal check
    if (M !== undefined) {
        const eb = Number(eBase) + bias + manBits;
        if (M >= normMin && M <= normMax && eb >= 1 && eb <= maxExp) return true;
    }

    // Subnormal numbers
    const targetExp = BigInt(1 - bias - manBits);
    const shiftSub = EBig - targetExp;

    if (shiftSub >= 0n) {
        const M_sub = F << shiftSub;
        if (M_sub >= 1n && M_sub <= subMax) return true;
    } else {
        const mask = (1n << -shiftSub) - 1n;
        if ((F & mask) === 0n) {
            const M_sub = F >> -shiftSub;
            if (M_sub >= 1n && M_sub <= subMax) return true;
        }
    }

    return false;
}

// Runtime type checker function
const _isQuant = Object.freeze({
    // Fast quantised integer checks
    q4:  (v) => typeof v === 'number' && (v << 28 >> 28) === v, // -8 to 7
    q6:  (v) => typeof v === 'number' && (v << 26 >> 26) === v, // -32 to 31
    q8:  (v) => typeof v === 'number' && (v << 24 >> 24) === v, // -128 to 127
    q16: (v) => typeof v === 'number' && (v << 16 >> 16) === v, // -32,768 to 32,767
    q32: (v) => _is.i32(v), // Alias of i32

    // Special quantised checks
    nf4:       (v) => _isSmallQValidFast(v, _isQuant_LUT.NF4),
    f4_E2M1:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP4_E2M1),
    f4_E3M0:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP4_E3M0),
    f5_E2M2:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP5_E2M2),
    f5_E3M1:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP5_E3M1),
    f5_E4M0:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP5_E4M0),
    f6_E2M3:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP6_E2M3),
    f6_E3M2:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP6_E3M2),
    f7_E2M4:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP7_E2M4),
    f7_E3M3:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP7_E3M3),
    f7_E4M2:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP7_E4M2),
    f8_E4M3:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP8_E4M3),
    f8_E5M2:   (v) => _isSmallQValidFast(v, _isQuant_LUT.FP8_E5M2),
    bf16:      (v) => _isBigQValid(v, { expBits: 8, manBits: 7, bias: 127 }),
    f16_IEEE:  (v) => _isBigQValid(v, { expBits: 5, manBits: 10, bias: 15 }),
    f32_IEEE:  (v) => _isBigQValid(v, { expBits: 8, manBits: 23, bias: 127 }),
    tf32:      (v) => _isBigQValid(v, { expBits: 8, manBits: 10, bias: 127 }),
});