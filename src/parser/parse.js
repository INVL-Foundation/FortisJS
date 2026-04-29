/**
 * @file parse.js
 * @description Handles the core logic of the parser side, requires is.js
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

// Helper functions
const _isAnyBuffer = (v) => {
    const tag = _getTag(v);
    return tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]';
};
const _arrayTags = new Map([
    [ArrayBuffer, '[object ArrayBuffer]'],
    [Int8Array, '[object Int8Array]'],                 // -128 to 127 (1 byte)
    [Int16Array, '[object Int16Array]'],               // -32,768 to 32,767 (2 bytes)
    [Int32Array, '[object Int32Array]'],               // -2,147,483,648 to 2,147,483,647 (4 bytes)
    [BigInt64Array, '[object BigInt64Array]'],         // -2^63 to 2^63 - 1 (8 bytes)
    [Uint8Array, '[object Uint8Array]'],               // 0 to 255 (1 byte)
    [Uint8ClampedArray, '[object Uint8ClampedArray]'], // 0 to 255 (1 byte)
    [Uint16Array, '[object Uint16Array]'],             // 0 to 65,535 (2 bytes)
    [Uint32Array, '[object Uint32Array]'],             // 0 to 4,294,967,295 (4 bytes)
    [BigUint64Array, '[object BigUint64Array]'],       // 0 to 2^64 - 1 (8 bytes)
    [Float16Array, '[object Float16Array]'],           // -65,504 to 65,504 (2 bytes)
    [Float32Array, '[object Float32Array]'],           // -3.4e38 to 3.4e38 (4 bytes)
    [Float64Array, '[object Float64Array]'],           // -1.8e308 to 1.8e308 (8 bytes)
]);

// Banker's rounding; round half to even
const _roundBigInt = (b, roundDigit, restStr, negative) => {
    const isExactHalf = roundDigit === 5 && /^0*$/.test(restStr);
    if (isExactHalf) { if (b % 2n !== 0n) b += (negative ? -1n : 1n) }
    else if (roundDigit > 5) { b += (negative ? -1n : 1n) }
    return b;
};

function _toMultiInt(TNum, v) {
    // DEBUG ONLY: Handle empty/whitespace-only strings
    // if (typeof v === 'string' && v.trim() === '') return 0;

    // BigInt types (i64, u64, i128, u128, bigInt)
    if (TNum.includes('64') || TNum.includes('128') || TNum === 'bigInt') {
        let b;
        // Use BigInt() to handle strings like '100' and '0x10'
        // If input string is '100.5' (floats) or '1e3' (scientific), convert to Number then BigInt
        try {
            if (typeof v === 'string') {
                const s = v.trim();
                
                // Handle scientific notation (1e3, 1.5e10)
                if (/[eE]/.test(s)) {
                    const [mantissa, exp] = s.split(/[eE]/);
                    const e = parseInt(exp, 10);
                    const negative = mantissa.startsWith('-');

                    if (mantissa.includes('.')) {
                        const [intPart, fracPart] = mantissa.split('.');
                        const digits = intPart + fracPart;
                        const shift = e - fracPart.length;
                        if (shift >= 0) {
                            b = BigInt(digits) * (10n ** BigInt(shift));
                        } else {
                            const keep = digits.length + shift;
                            const roundDigit = digits.charCodeAt(keep) - 48;
                            b = BigInt(digits.slice(0, keep));
                            b = _roundBigInt(b, roundDigit, digits.slice(keep + 1), negative);
                        }
                    } else {
                        if (e >= 0) {
                            b = BigInt(mantissa) * (10n ** BigInt(e));
                        } else {
                            const abs = mantissa.replace('-', '');
                            const roundPos = -e - 1;
                            const roundDigit = roundPos < abs.length ? abs.charCodeAt(roundPos) - 48 : 0;
                            const restStr = roundPos + 1 < abs.length ? abs.slice(roundPos + 1) : '';
                            b = 0n;
                            b = _roundBigInt(b, roundDigit, restStr, negative);
                        }
                    }
                } else if (s.includes('.')) {
                    const [intPart, fracPart] = s.split('.');
                    const negative = intPart.startsWith('-');
                    const safeInt = (intPart === '-' || intPart === '') ? '0' : intPart;
                    b = BigInt(safeInt);
                    if (fracPart) {
                        const firstDigit = fracPart.charCodeAt(0) - 48;
                        b = _roundBigInt(b, firstDigit, fracPart.slice(1), negative);
                    }
                } else {
                    // Handle Hex (0xff), Binary (0b), Octal (0o), and Integers
                    b = BigInt(s);
                }
            } else if (typeof v === 'number') {
                b = BigInt(Math.round(v));
            } else {
                b = BigInt(v);
            }
        } catch (e) {
            throw new TypeError(`Invalid BigInt: could not parse input "${v}"`);
        }

        // Range check for BigInt
        if (_is[TNum](b)) return b;
        throw new RangeError(`Value ${b} is out of bounds for type ${TNum}`);
    }

    // Continue with normal numbers logic
    const n = Math.trunc(Number(v)); // Attempt conversion with truncation

    // Check for NaN and Infinity THEN range
    if (Number.isNaN(n) || !Number.isFinite(n)) {
        throw new TypeError(`Invalid number: could not parse input "${v}"`);
    } else {
        if (_is[TNum](n)) {
            return n;
        } else {
            throw new RangeError(`Value ${n} is out of bounds for type ${TNum}`);
        }
    }
}

/**
 * TypedArray Helper
 * Handles: Strings, Arrays, existing Buffers, or single Numbers
 * @param {Function} TArray - The TypedArray constructor (e.g. Float32Array, BigInt64Array)
 * @param {any} v - The value to write
 * @param {number} offset - The byte offset (defaults to 0)
 * @param {boolean} littleEndian - Byte order (defaults to true)
 */
function _smartArray(TArray, v, offset = 0, littleEndian = true) {
    // Quick exit for same type
    const tArrType = _getTag(v);
    if (tArrType === _arrayTags.get(TArray)) return v;

    // ArrayBuffer pass through
    if (TArray === ArrayBuffer) {
        if (v instanceof ArrayBuffer) return v;
        if (ArrayBuffer.isView(v)) return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
        if (typeof v === 'string') return new TextEncoder().encode(v).buffer;
        if (Array.isArray(v)) return new Uint8Array(v.map(Number)).buffer;
        return new ArrayBuffer(0);
    }

    // Array input
    if (Array.isArray(v)) {
        const out = new TArray(v.length);
        const isBig = TArray === BigInt64Array || TArray === BigUint64Array;
        
        for (let i = 0; i < v.length; i++) {
            let item = v[i];

            if (typeof item === 'string') item = item.replace(/[^0-9a-fobx.e+-n]/gi, '');
            
            if (isBig) {
                // Force to BigInt
                try {
                    // Handle numbers or strings
                    if (typeof item !== 'bigint') {
                        item = String(item);

                        if (item.includes('e') || item.includes('E')) {
                            const [m, e] = item.split(/[eE]/);
                            const exp = parseInt(e, 10);
                            
                            if (exp < 0) {
                                item = '0';
                            } else {
                                const [int, dec = ''] = m.split('.');
                                // Logic: integer + shifted decimal
                                // padEnd ensures enough zeros; slice ditches extra decimals
                                item = int + dec.padEnd(exp, '0').slice(0, exp);
                            }
                        }
                        // Remove 'n', truncate decimals, checks for signs, fallback to 0
                        const clean = item.replace(/n/gi, '').split('.')[0];
                        const isNumeric = clean && clean !== '-' && clean !== '+';
                        out[i] = BigInt(isNumeric ? clean : 0);
                    } else {
                        out[i] = item; // Already a BigInt
                    }
                } catch {
                    out[i] = 0n;
                }
            } else {
                // Force to number
                out[i] = (typeof item === 'bigint') ? Number(item) : (Number(item) || 0);
            }
        }

        return out;
    }

    // Reuse existing buffer or view (with alignment handling)
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
        const buffer = v instanceof ArrayBuffer ? v : v.buffer;
        const byteOffset = v.byteOffset || 0;
        const byteLen = v.byteLength ?? buffer.byteLength;

        if (byteOffset % TArray.BYTES_PER_ELEMENT === 0) {
            const length = Math.floor(byteLen / TArray.BYTES_PER_ELEMENT);
            return new TArray(buffer, byteOffset, length);
        }

        // Unaligned: copy raw bytes to a new aligned buffer
        const copyBuffer = new ArrayBuffer(byteLen);
        new Uint8Array(copyBuffer).set(new Uint8Array(buffer, byteOffset, byteLen));
        return new TArray(copyBuffer);
    }

    // String input to UTF-8 bytes
    if (typeof v === 'string') {
        const utf8 = new TextEncoder().encode(v);
        if (offset === 0) {
            if (TArray === Uint8Array) return utf8;
            if (TArray === Uint8ClampedArray) {
                return new Uint8ClampedArray(utf8.buffer, utf8.byteOffset, utf8.byteLength);
            }
        }

        const buffer = new ArrayBuffer(offset + utf8.byteLength);
        new Uint8Array(buffer).set(utf8, offset);
        return new TArray(buffer);
    }

    // Number or BigInt input
    const expectedType = TArray.name.includes('Big') ? 'bigint' : 'number';
    if (typeof v !== expectedType) {
        throw new TypeError(
            `${TArray.name} expects ${expectedType}, but received ${typeof v} (${v})`
        );
    }

    const buffer = new ArrayBuffer(offset + TArray.BYTES_PER_ELEMENT);
    const view = new DataView(buffer);

    let typeName = TArray.name.replace('Array', '');
    if (typeName === 'Uint8Clamped') typeName = 'Uint8';

    try {
        view[`set${typeName}`](offset, v, littleEndian);
    } catch (e) {
        throw new TypeError(`Cannot convert ${typeof v} into ${TArray.name}: ${e.message}`);
    }

    return new TArray(buffer);
}

// Default value configuration
const _configs = Object.freeze({
    // type: [ coercionFn, fallbackValue ]
    // Primitives
    string:    [(v) => String(v ?? ''), ''],
    number:    [(v) => Number(v), 0],
    float:     [(v) => parseFloat(v), 0.0],
    bool:      [(v) => {
            if (typeof v === 'string') {
                const s = v.toLowerCase().trim();
                if (s === 'true' || s === '1') return true;
                if (s === 'false' || s === '0') return false;
            }
            return Boolean(v);
        }, false],
    fn:        [(v) => (_is.fn(v) ? v : function() {}), function() {}],
    arrowFn:   [(v) => (_is.arrowFn(v) ? v : () => {}), () => {}],
    symbol:    [(v) => (_is.symbol(v) ? v : Symbol()), Symbol()],
    registeredSymbol: [(v) => (_is.registeredSymbol(v) ? v : Symbol.for('default')), Symbol.for('default')],
    null:      [() => null, null],
    undefined: [() => undefined, undefined],

    // Numbers
    int:     [(v) => _toMultiInt('int', v), 0],
    i8:      [(v) => _toMultiInt('i8', v), 0],
    i16:     [(v) => _toMultiInt('i16', v), 0],
    i32:     [(v) => _toMultiInt('i32', v), 0],
    i64:     [(v) => _toMultiInt('i64', v), 0n],
    i128:    [(v) => _toMultiInt('i128', v), 0n],
    u8:      [(v) => _toMultiInt('u8', v), 0],
    u16:     [(v) => _toMultiInt('u16', v), 0],
    u32:     [(v) => _toMultiInt('u32', v), 0],
    u64:     [(v) => _toMultiInt('u64', v), 0n],
    u128:    [(v) => _toMultiInt('u128', v), 0n],
    bigInt:  [(v) => _toMultiInt('bigInt', v), 0n],
    safeInt: [(v) => _toMultiInt('safeInt', v), 0],
    
    // TypedArray Coercion: attempt to wrap input or create from it
    arrayBuffer:    [(v) => _smartArray(ArrayBuffer, v), new ArrayBuffer(0)],
    i8Array:        [(v) => _smartArray(Int8Array, v), new Int8Array(0)],
    i16Array:       [(v) => _smartArray(Int16Array, v), new Int16Array(0)],
    i32Array:       [(v) => _smartArray(Int32Array, v), new Int32Array(0)],
    i64Array:       [(v) => _smartArray(BigInt64Array, v), new BigInt64Array(0)],
    u8Array:        [(v) => _smartArray(Uint8Array, v), new Uint8Array(0)],
    u8ClampedArray: [(v) => _smartArray(Uint8ClampedArray, v), new Uint8ClampedArray(0)],
    u16Array:       [(v) => _smartArray(Uint16Array, v), new Uint16Array(0)],
    u32Array:       [(v) => _smartArray(Uint32Array, v), new Uint32Array(0)],
    u64Array:       [(v) => _smartArray(BigUint64Array, v), new BigUint64Array(0)],
    f16Array:       [(v) => _smartArray(Float16Array, v), new Float16Array(0)],
    f32Array:       [(v) => _smartArray(Float32Array, v), new Float32Array(0)],
    f64Array:       [(v) => _smartArray(Float64Array, v), new Float64Array(0)],
    
    date: [(v) => new Date(v), new Date()],
    url:  [(v) => new URL(v), new URL('about:blank')],
    obj:  [(v) => (v && typeof v === 'object' ? v : {}), {}]
});

const _parse = {};
const _linkedParserFns = Object.keys(_configs).filter(type => typeof _is[type] === 'function');

_linkedParserFns.forEach(type => {
    _parse[type] = (input, coerce = false, asObject = false, customErr = '', debug = false) => {
        // Core variables
        const [tryInto, fallback] = _configs[type];
        let isValid = _is[type](input), isErr = false, output = null, errMsg = '';

        if (!isValid && coerce) {
            try {
                output = tryInto(input);
                isValid = true; // Conversion process ok
            } catch (e) {
                output = fallback;
                errMsg = e.message; // Log error message
                isErr = true, isValid = true; // Return fallback value, assert error state
            }
        } else {
            if (isValid) { output = input; }
            else {
                errMsg = `Value "${input} (${typeof input})" is not of type ${type}`;
                isErr = true;
            }
        }

        // Prioritise user specified error msg
        if (customErr) errMsg = customErr;
        
        if (!isValid && !asObject) {
            // If graceful failure / asObject = false, throw error directly
            throw new TypeError(errMsg);
        } else {
            if (asObject) {
                return {
                    error: isErr,
                    message: errMsg,
                    result: output
                };
            } else {
                if (isErr && debug) console.warn(errMsg); // May cause performance degradation if called excessively
                return output;
            }
        }
    };
});