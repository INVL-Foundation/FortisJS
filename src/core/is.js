/**
 * @file is.js
 * @description Handles the core logic of the FortisJS library.
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

// Helper functions
const _toString = Object.prototype.toString;
const _getTag = (v) => _toString.call(v);

// Multiple-of Utility
const _multipleOf = Object.freeze({
    /**
     * @param {number} v - The integer value to check
     * @param {number} n - The divisor
     * @returns {boolean} True if v is an integer multiple of n
     */
    Int: (v, n) => {
        if (typeof v !== 'number' || typeof n !== 'number' || n === 0) return false;
        if (!Number.isInteger(v) || !Number.isInteger(n)) return false;
        const absN = Math.abs(n);
        if (Math.abs(v) < 0x80000000 && absN < 0x80000000 && (absN & (absN - 1)) === 0) return (Math.abs(v) & (absN - 1)) === 0;
        return v % n === 0;
    },

    /**
     * @param {bigint} v - The BigInt value to check
     * @param {bigint} n - The BigInt divisor
     * @returns {boolean} True if v is a multiple of n with zero remainder
     */
    BigInt: (v, n) => typeof v === 'bigint' && typeof n === 'bigint' && n !== 0n && v % n === 0n,

    /**
     * @param {number} v - The float to check
     * @param {number} n - The divisor
     * @returns {boolean} True if v is a multiple of n within a 1e-12 threshold
     */
    Float: (v, n) => {
        if (typeof v !== 'number' || typeof n !== 'number' || n === 0 || !Number.isFinite(v)) return false;
        const r = Math.abs(v % n);
        return r < 1e-12 || Math.abs(r - Math.abs(n)) < 1e-12;
    },

    /**
     * @param {number} v - The float to check
     * @param {number} n - The divisor
     * @returns {boolean} True if v is a multiple of n within machine epsilon limits
     */
    SafeFloat: (v, n) => {
        if (typeof v !== 'number' || typeof n !== 'number' || n === 0 || !Number.isFinite(v)) return false;
        const r = v % n; // Remainder
        const m = Number.EPSILON * Math.max(Math.abs(v), Math.abs(n)); // Margin
        return Math.abs(r) < m || Math.abs(r - n) < m;
    }
});

// Runtime type checker function
const _is = Object.freeze({
    // Primitives
    string:    (v) => typeof v === 'string',
    number:    (v) => typeof v === 'number' && Number.isFinite(v), // Double, rejects NaN or Infinity
    float:     (v) => typeof v === 'number' && Number.isFinite(v) && v % 1 !== 0,
    bool:      (v) => typeof v === 'boolean',
    fn:        (v) => typeof v === 'function',
    symbol:    (v) => typeof v === 'symbol' || (_getTag(v) === '[object Symbol]'),
    registeredSymbol: (v) => typeof v === 'symbol' && Symbol.keyFor !== undefined && Symbol.keyFor(v) !== undefined,
    null:      (v) => v === null,
    undefined: (v) => v === undefined,

    // Numbers
    int:      (v) => Number.isInteger(v),
    i8:       (v) => Number.isInteger(v) && v >= -128 && v <= 127,
    i16:      (v) => Number.isInteger(v) && v >= -32768 && v <= 32767,
    i32:      (v) => typeof v === 'number' && (v | 0) === v, // -2147483648 to 2147483647
    i64:      (v) => typeof v === 'bigint' && BigInt.asIntN(64, v) === v,  // -2^63 to 2^63-1
    i128:     (v) => typeof v === 'bigint' && BigInt.asIntN(128, v) === v, // -2^127 to 2^127 - 1
    u8:       (v) => Number.isInteger(v) && (v & 0xff) === v,
    u16:      (v) => Number.isInteger(v) && (v & 0xffff) === v,
    u32:      (v) => typeof v === 'number' && (v >>> 0) === v,
    u64:      (v) => typeof v === 'bigint' && v >= 0n && BigInt.asUintN(64, v) === v,  // 0 to 2^64-1
    u128:     (v) => typeof v === 'bigint' && v >= 0n && BigInt.asUintN(128, v) === v, // 0 to 2^128 - 1
    bigInt:   (v) => typeof v === 'bigint',
    safeInt:  (v) => Number.isSafeInteger(v), // Within 2^53 - 1 precision limit

    // Collections
    array: (v) => Array.isArray(v),
    obj:   (v) => {
        if (typeof v !== 'object' || v == null) return false;
        const p = Object.getPrototypeOf(v);
        return p === null || p.constructor === Object;
    },
    secureObj: (v) => {
        if (typeof v !== 'object' || v === null) return false; // Type check
        if (_getTag(v) !== '[object Object]') return false; // Tag check
        const p = Object.getPrototypeOf(v); // Call Object.getPrototypeOf() once
        if (p === Object.prototype || p === null) return true; // Handle Object.create(null)
        let r = p; // Prototype walk to root (no classes/custom proto)
        while (Object.getPrototypeOf(r) !== null) r = Object.getPrototypeOf(r);
        return p === r;
    },
    map:     (v) => _getTag(v) === '[object Map]',
    set:     (v) => _getTag(v) === '[object Set]',
    weakMap: (v) => _getTag(v) === '[object WeakMap]',
    weakSet: (v) => _getTag(v) === '[object WeakSet]',
    empty: (v) => {
        if (v == null) return true; // Null-state
        if (typeof v === 'function') return false;
        if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'bigint') return false;
        const len = v.length; // Length: arr, str, typedarr, buffer
        if (typeof len === 'number') return len === 0;
        const size = v.size; // Size-based: map, set
        if (typeof size === 'number') return size === 0;
        if (typeof v === 'object') {
            if (Reflect.ownKeys(v).some(() => true)) return false;
            const proto = Object.getPrototypeOf(v);
            return proto === null || proto === Object.prototype;
        }
        return false;
    },

    // Async & Logic
    date:        (v) => _getTag(v) === '[object Date]' && !isNaN(v),
    regexp:      (v) => _getTag(v) === '[object RegExp]',
    promise:     (v) => v !== null && typeof v === 'object' && typeof v.then === 'function',
    asyncFn:     (v) => _getTag(v) === '[object AsyncFunction]',
    temporal:    (v) => v !== null && typeof v === 'object' && _getTag(v).includes('Temporal'),
    generator:   (v) => v != null && typeof v.next === 'function' && typeof v[Symbol.iterator] === 'function' && _getTag(v) === '[object Generator]',
    generatorFn: (v) => _getTag(v) === '[object GeneratorFunction]',
    asyncGeneratorFn: (v) => _getTag(v) === '[object AsyncGeneratorFunction]',
    iterable:    (v) => v != null && typeof v[Symbol.iterator] === 'function',
    error:       (v) => _getTag(v) === '[object Error]' || v instanceof Error,
    method:      (v) => {
        if (typeof v !== 'function') return false;
        return !Object.prototype.hasOwnProperty.call(v, 'prototype') && !Function.prototype.toString.call(v).startsWith('class');
    },

    // TypedArray
    i8Array:        (v) => _getTag(v) === '[object Int8Array]',         // -128 to 127 (1 byte)
    i16Array:       (v) => _getTag(v) === '[object Int16Array]',        // -32,768 to 32,767 (2 bytes)
    i32Array:       (v) => _getTag(v) === '[object Int32Array]',        // -2,147,483,648 to 2,147,483,647 (4 bytes)
    i64Array:       (v) => _getTag(v) === '[object BigInt64Array]',     // -2^63 to 2^63 - 1 (8 bytes)
    u8Array:        (v) => _getTag(v) === '[object Uint8Array]',        // 0 to 255 (1 byte)
    u8ClampedArray: (v) => _getTag(v) === '[object Uint8ClampedArray]', // 0 to 255 (1 byte)
    u16Array:       (v) => _getTag(v) === '[object Uint16Array]',       // 0 to 65,535 (2 bytes)
    u32Array:       (v) => _getTag(v) === '[object Uint32Array]',       // 0 to 4,294,967,295 (4 bytes)
    u64Array:       (v) => _getTag(v) === '[object BigUint64Array]',    // 0 to 2^64 - 1 (8 bytes)
    f16Array:       (v) => _getTag(v) === '[object Float16Array]',      // -65,504 to 65,504 (2 bytes)
    f32Array:       (v) => _getTag(v) === '[object Float32Array]',      // -3.4e38 to 3.4e38 (4 bytes)
    f64Array:       (v) => _getTag(v) === '[object Float64Array]',      // -1.8e308 to 1.8e308 (8 bytes)

    // Binary & Files
    arrayBuffer:       (v) => _getTag(v) === '[object ArrayBuffer]',
    sharedArrayBuffer: (v) => _getTag(v) === '[object SharedArrayBuffer]',
    dataView:          (v) => _getTag(v) === '[object DataView]',
    isView:            (v) => ArrayBuffer.isView(v), // Both TypedArray & DataView
    blob: (v) => _getTag(v) === '[object Blob]',
    file: (v) => _getTag(v) === '[object File]',

    // Web / DOM
    element:  (v) => !!(v && v.nodeType === 1 && v.nodeName),
    url:      (v) => _getTag(v) === '[object URL]' || (v?.href && v?.protocol),
    formData: (v) => !!(v && typeof v.append === 'function' && _getTag(v) === '[object FormData]'),

    // Miscellaneous
    multipleOf: (v, n) => {
        const t = typeof v;
        if (t !== typeof n) return false;
        if (t === 'bigint') return _multipleOf.BigInt(v, n);
        if (t === 'number' && Number.isFinite(v) && Number.isFinite(n)) {
            if ((v | 0) === v && (n | 0) === n) return _multipleOf.Int(v, n);
            return _multipleOf.SafeFloat(v, n);
            //return _multipleOf.Float(v, n) || _multipleOf.SafeFloat(v, n);
        }
        return false;
    },
    safeString: (v) => {
        if (typeof v !== 'string') return false;
        if (v.isWellFormed && !v.isWellFormed()) return false; // ES2024
        return !v.includes('\0') && v === v.normalize();
    },
    likeArrowFn:    (v) => typeof v === 'function' && !v.hasOwnProperty('prototype') && v.toString().includes('=>'), // Heuristic check; may produce false results with transpiled/minified code or match class field arrow methods incorrectly
});