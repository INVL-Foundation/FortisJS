/**
 * @file parse-quant.js
 * @description Handles parsing of values for quantised formats, requires is-quant.js
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

// Helper functions
// Maximum finite value for given format
const _isQuant_maxFinite = (expBits, manBits, bias) => {
    const maxExp = (1 << expBits) - 2;
    return (2 - 2 ** -manBits) * 2 ** (maxExp - bias);
};

// Round‑ties‑to‑even right shift
const _isQuant_roundShift = (F, shift) => {
    if (shift >= 0) return F << BigInt(shift);
    const rsh     = BigInt(-shift);
    const mask    = (1n << rsh) - 1n;
    const dropped = F & mask;
    let M         = F >> rsh;
    const half    = 1n << (rsh - 1n);
    if (dropped > half || (dropped === half && (M & 1n))) M += 1n;
    return M;
};

function _parseSmallQ(input, meta) {
    const num = +input;
    if (Number.isNaN(num)) return meta.hasNaN ? NaN : undefined;

    const f32 = Math.fround(num);
    const bits = _isQuant_toBits(f32);
    if (meta.intSet.has(bits)) return f32; // Exact match

    const vals = meta.values;
    let lo = 0, hi = vals.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (vals[mid] < num) lo = mid + 1;
        else hi = mid;
    }
    // lo is insertion point; candidates are lo-1 (if exists) and lo (if exists)

    let bestIdx = -1;
    if (lo > 0) bestIdx = lo - 1; // Left neighbour
    if (lo < vals.length) {
        if (bestIdx === -1) {
            bestIdx = lo; // No left neighbour; right is best
        } else {
            const dLeft  = num - vals[lo - 1]; // Guaranteed ≥ 0
            const dRight = vals[lo] - num;     // Guaranteed ≥ 0
            if (dRight < dLeft || (dRight === dLeft && meta.even[lo] && !meta.even[bestIdx])) {
                bestIdx = lo;
            }
        }
    }

    _isQuant_u32SmallView[0] = meta.bits[bestIdx];
    return _isQuant_f32SmallView[0];
}

/**
 * @param {string|number|bigint} value - The value to parse
 * @param {Object} quantFormat - The bit-level configuration of target quantisation
 * @param {number} quantFormat.expBits - Number of bits allocated to the exponent
 * @param {number} quantFormat.manBits - Number of bits allocated to the mantissa (fraction)
 * @param {number} [quantFormat.bias] - The exponent bias (defaults to IEEE 754 standard: (2^(expBits - 1)) - 1)
 * @param {boolean} [quantFormat.infinitySupported] - Should target format support Infinity and NaN (defaults to true)
 */
function _parseBigQ(value, {
    expBits,
    manBits,
    bias = (1 << (expBits - 1)) - 1,
    infinitySupported = true
}) {
    // Handle special IEEE-754 values
    const num = Number(value);
    if (Number.isNaN(num)) return NaN;
    if (!isFinite(num) || num === 0) {
        if (num === 0) return num;
        // Infinity handling
        if (infinitySupported) return num; // ±Infinity preserved
        const maxf = _isQuant_maxFinite(expBits, manBits, bias);
        return num > 0 ? maxf : -maxf; // Saturation
    }

    // Extract double-precision components
    const absVal = num < 0 ? -num : num;
    _isQuant_largeView.setFloat64(0, absVal, true);
    const lo = _isQuant_largeView.getUint32(0, true);
    const hi = _isQuant_largeView.getUint32(4, true);
    const bits = (BigInt(hi) << 32n) | BigInt(lo);

    const expRaw = Number((bits >> 52n) & 0x7ffn);
    const mant   = bits & 0xfffffffffffffn;

    let F, E;
    if (expRaw === 0) { F = mant; E = -1074 }
    else { F = (1n << 52n) | mant; E = expRaw - 1075 }

    const sign  = num < 0 ? -1 : 1;
    const mBits = BigInt(manBits);
    const L     = _isQuant_bitLength(F);

    // Normal numbers
    const normMin    = 1n << mBits;
    const normMax    = (1n << (mBits + 1n)) - 1n;
    const maxBiased  = (1 << expBits) - 2;

    const shiftNorm  = manBits + 1 - L;
    let M_norm       = _isQuant_roundShift(F, shiftNorm);
    let eBaseNorm    = E - shiftNorm;

    // Renormalise until mantissa is in [normMin, normMax] or exponent dies
    // Overflow carry
    while (M_norm >= (1n << (mBits + 1n))) { M_norm >>= 1n; eBaseNorm += 1 }
    while (M_norm < normMin && eBaseNorm + bias + manBits > 0) { M_norm <<= 1n; eBaseNorm -= 1 }

    const eBiasedNorm = eBaseNorm + bias + manBits;
    if (eBiasedNorm >= 1 && eBiasedNorm <= maxBiased && M_norm >= normMin) return sign * Number(M_norm) * 2 ** eBaseNorm;
    if (eBiasedNorm > maxBiased) return sign * _isQuant_maxFinite(expBits, manBits, bias);

    // Subnormals / underflows
    const targetExpMin = 1 - bias - manBits;
    const shiftSub     = E - targetExpMin;
    const M_sub        = _isQuant_roundShift(F, shiftSub);
    const subMax       = (1n << mBits) - 1n;

    if (M_sub > subMax) return sign * Number(1n << mBits) * 2 ** targetExpMin;
    if (M_sub === 0n) return sign * 0;
    return sign * Number(M_sub) * 2 ** targetExpMin;
}

const _parseQuant = Object.freeze({
    nf4:       (v) => _parseSmallQ(v, _isQuant_LUT.NF4),
    f4_E2M1:   (v) => _parseSmallQ(v, _isQuant_LUT.FP4_E2M1),
    f4_E3M0:   (v) => _parseSmallQ(v, _isQuant_LUT.FP4_E3M0),
    f6_E2M3:   (v) => _parseSmallQ(v, _isQuant_LUT.FP6_E2M3),
    f6_E3M2:   (v) => _parseSmallQ(v, _isQuant_LUT.FP6_E3M2),
    f8_E4M3:   (v) => _parseSmallQ(v, _isQuant_LUT.FP8_E4M3),
    f8_E5M2:   (v) => _parseSmallQ(v, _isQuant_LUT.FP8_E5M2),
    bf16:      (v) => _parseBigQ(v, { expBits: 8, manBits: 7, bias: 127 }),
    f16_IEEE:  (v) => _parseBigQ(v, { expBits: 5, manBits: 10, bias: 15 }),
    f32_IEEE:  (v) => _parseBigQ(v, { expBits: 8, manBits: 23, bias: 127 }),
    tf32:      (v) => _parseBigQ(v, { expBits: 8, manBits: 10, bias: 127 }),
});