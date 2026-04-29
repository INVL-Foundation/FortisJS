/**
 * @file is-schema.js
 * @description Schema validation for `is.js` or `is-quant.js`, and its components.
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

/**
 * @param {Object} data - The data to validate
 * @param {Object} schema - Mapping of keys to predicate functions or nested schemas
 * @param {boolean} strict - Enables strict mode (rejects keys not in schema, recursively)
 * @param {string} path - Used internally for recursion and nested path tracking
 * @returns {Object} report - { valid, fields, errors, flatErrors[, message] }
 */
const _validate = (data, schema, strict = false, path = '') => {
    const report = { valid: true, fields: {}, errors: 0, flatErrors: {} };

    // Initial guard; early return
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        report.valid = false;
        report.errors = 1;
        report.message = "Input is not a valid object";
        return report;
    }

    for (const key of Object.keys(schema)) {
        const entry   = schema[key];
        const val     = data[key];
        const curPath = path ? `${path}.${key}` : key;

        // Check must be a function; not just truthy
        const isConfig = typeof entry?.check === 'function' || entry?.min !== undefined || entry?.max !== undefined;
        const isNested = !isConfig && typeof entry === 'object' && entry !== null;

        let res;

        if (isNested) {
            // Guard missing nested value before recursing for cleaner error
            if (val === undefined || val === null) {
                res = { valid: false, errors: 1, type: 'schema',
                        message: `${curPath} is missing or null` };
                report.flatErrors[curPath] = res.message;
            } else {
                const child = _validate(val, entry, strict, curPath);
                Object.assign(report.flatErrors, child.flatErrors);

                // Avoid spreading child into res (no self-duplication in child key)
                res = {
                    valid:   child.valid,
                    errors:  child.errors,
                    type:    'schema',
                    message: child.valid ? 'OK' : `${key} has ${child.errors} error(s)`,
                    children: { valid: child.valid, fields: child.fields, errors: child.errors }
                };
            }
        } else {
            const check = isConfig ? entry.check : entry;

            const hasCheck = typeof check === 'function';

            let msg = 'OK';

            // Phase 1; run predicate if exists
            if (hasCheck) {
                const checkPassed = !!check(val);
                if (!checkPassed) {
                    msg = (isConfig && entry.message) || `Invalid ${key}`;
                }
            }

            // Phase 2; run range checks independently (only if predicate didn't fail)
            if (msg === 'OK' && isConfig) {
                // Handle string length, array length, raw numbers
                const size = (typeof val === 'string' || Array.isArray(val)) ? val.length : val;
                if      (entry.min !== undefined && size < entry.min) msg = `Below minimum ${entry.min}`;
                else if (entry.max !== undefined && size > entry.max) msg = `Exceeds maximum ${entry.max}`;
            }

            const valid = msg === 'OK';
            if (!valid) report.flatErrors[curPath] = msg;

            res = { valid, type: check?.name || 'custom', message: msg };
        }

        report.fields[key] = {
            valid:   res.valid,
            type:    res.type,
            message: res.message,
            value:   isNested ? '[Nested]' : val,
            ...(isNested && res.children && { children: res.children })
        };

        if (!res.valid) {
            report.valid = false;
            report.errors += isNested ? (res.errors ?? 0) : 1;
        }
    }

    // Strict mode: reject excess keys (recursion already handles nested levels)
    if (strict) {
        for (const k of Object.keys(data)) {
            if (!Object.hasOwn(schema, k)) {
                const xPath = path ? `${path}.${k}` : k;
                report.flatErrors[xPath] = 'Excess key not allowed';
                report.valid = false;
                report.errors++;
            }
        }
    }

    return report;
};

const _validateAsync = async (data, schema, strict = false, path = '') => {
    const report = { valid: true, fields: {}, errors: 0, flatErrors: {} };

    // Initial guard; early return
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        report.valid = false;
        report.errors = 1;
        report.message = "Input is not a valid object";
        return report;
    }

    const tasks = Object.keys(schema).map(async (key) => {
        const entry   = schema[key];
        const val     = data[key];
        const curPath = path ? `${path}.${key}` : key;

        const isConfig = typeof entry?.check === 'function' || entry?.min !== undefined || entry?.max !== undefined;
        const isNested = !isConfig && typeof entry === 'object' && entry !== null;

        let res;

        if (isNested) {
            if (val === undefined || val === null) {
                res = { valid: false, errors: 1, type: 'schema',
                        message: `${curPath} is missing or null` };
                report.flatErrors[curPath] = res.message;
            } else {
                const child = await _validateAsync(val, entry, strict, curPath);
                Object.assign(report.flatErrors, child.flatErrors);
                res = {
                    valid:    child.valid,
                    errors:   child.errors,
                    type:     'schema',
                    message:  child.valid ? 'OK' : `${key} has ${child.errors} error(s)`,
                    children: { valid: child.valid, fields: child.fields, errors: child.errors }
                };
            }
        } else {
            const check = isConfig ? entry.check : entry;
            const hasCheck = typeof check === 'function';

            let msg = 'OK';

            // Phase 1: await predicate if exists (handles both sync and async transparently)
            if (hasCheck) {
                const checkPassed = !!(await check(val));
                if (!checkPassed) {
                    msg = (isConfig && entry.message) || `Invalid ${key}`;
                }
            }

            // Phase 2: run range checks independently (only if predicate didn't fail)
            if (msg === 'OK' && isConfig) {
                const size = (typeof val === 'string' || Array.isArray(val)) ? val.length : val;
                if      (entry.min !== undefined && size < entry.min) msg = `Below minimum ${entry.min}`;
                else if (entry.max !== undefined && size > entry.max) msg = `Exceeds maximum ${entry.max}`;
            }

            const valid = msg === 'OK';
            if (!valid) report.flatErrors[curPath] = msg;

            res = { valid, type: check?.name || 'custom', message: msg };
        }

        return { key, res, val, isNested };
    });

    // Run all sibling fields concurrently, then merge serially
    for (const { key, res, val, isNested } of await Promise.all(tasks)) {
        report.fields[key] = {
            valid:   res.valid,
            type:    res.type,
            message: res.message,
            value:   isNested ? '[Nested]' : val,
            ...(isNested && res.children && { children: res.children })
        };

        if (!res.valid) {
            report.valid = false;
            report.errors += isNested ? (res.errors ?? 0) : 1;
        }
    }

    // Strict mode: reject excess keys
    if (strict) {
        for (const k of Object.keys(data)) {
            if (!Object.hasOwn(schema, k)) {
                const xPath = path ? `${path}.${k}` : k;
                report.flatErrors[xPath] = 'Excess key not allowed';
                report.valid = false;
                report.errors++;
            }
        }
    }

    return report;
};