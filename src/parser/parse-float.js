/**
 * @file parse-float.js
 * @description Handles parsing for floats, requires is-float.js
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

const _toMultiFloat = (TFloat, v) => {
    let num = typeof v === 'number' ? v : parseFloat(v);
    
    if (!Number.isFinite(num)) {
        throw new TypeError(`Parse Error: "${v}" is not a finite number.`);
    }

    // Handle native/standard floats
    if (TFloat === 'f64') return num;
    if (TFloat === 'f32') return Math.fround(num);
    if (TFloat === 'f16') {
        return (typeof Math.f16round === 'function') 
            ? Math.f16round(num) 
            : new Float16Array([num])[0];
    }

    // Handle custom LUT-based floats (f4, f6, f8)
    const lut = { f4: _isF4_LUT, f6: _isF6_LUT, f8: _isF8_LUT }[TFloat];

    if (lut) {
        let low = 0;
        let high = lut.length - 1;

        // Immediate clamping
        if (num <= lut[low]) return lut[low];
        if (num >= lut[high]) return lut[high];

        // Binary search
        while (low <= high) {
            let mid = (low + high) >>> 1;
            let midVal = lut[mid];
            if (midVal < num) low = mid + 1;
            else if (midVal > num) high = mid - 1;
            else return midVal; 
        }

        // Post-loop: high is lower bound, low is upper bound
        // Check which is closer
        const diffLow = num - lut[high];
        const diffHigh = lut[low] - num;
        
        num = (diffLow <= diffHigh) ? lut[high] : lut[low];
    }

    // Final verification
    const validator = typeof _isFloat !== 'undefined' ? _isFloat[TFloat] : null;
    if (validator && !validator(num)) {
        throw new Error(`Parse Error: Value ${num} is invalid for type ${TFloat}`);
    }

    return num;
};