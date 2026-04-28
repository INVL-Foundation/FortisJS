/**
 * @file is-schema.js
 * @description Schema validation for `is.js` or `is-quant.js`, and its components.
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

/**
 * @param {Object} data - The data to validate
 * @param {Object} schema - Mapping of keys to predicate functions or nested schemas
 * @param {boolean} strict - Enables strict mode
 * @param {string} path - Used for recursion and nested schemas
 * @returns {Object}
 */
const _validate = (data, schema, strict = false, path = '') => {
    const report = { valid: true, fields: {}, errors: 0, flatErrors: {} };

    // Initial object guard
    if (!data || typeof data !== 'object') {
        report.valid = false;
        report.errors = 1;
        report.message = "Input is not a valid object";
        return report;
    }

    for (const key in schema) {
        const entry = schema[key];
        const val = data[key];
        const curPath = path ? `${path}.${key}` : key;
        
        const isConfig = entry?.check || entry?.min !== undefined;
        const isNested = typeof entry === 'object' && entry !== null && !isConfig;
        
        let res = { valid: true, type: 'custom', message: 'OK' };

        if (isNested) {
            // Recursive validation
            const childReport = _validate(val, entry, strict, curPath);
            Object.assign(report.flatErrors, childReport.flatErrors);
            delete childReport.flatErrors; 
            
            res = { ...childReport, type: 'schema', children: childReport };
        } else {
            // Predicate and Constraint logic
            const check = isConfig ? entry.check : entry;
            res.type = check.name || 'custom';
            res.valid = typeof check === 'function' && check(val);

            if (res.valid && isConfig) {
                const size = typeof val === 'string' ? val.length : val;
                if (entry.min !== undefined && size < entry.min) { 
                    res.valid = false; 
                    res.message = `Below minimum ${entry.min}`; 
                }
                else if (entry.max !== undefined && size > entry.max) { 
                    res.valid = false; 
                    res.message = `Exceeds maximum ${entry.max}`; 
                }
            }

            if (!res.valid) {
                res.message = (isConfig && entry.message) || res.message || `Invalid ${key}`;
                report.flatErrors[curPath] = res.message;
            }
        }

        // Map field results
        report.fields[key] = { 
            valid: res.valid, 
            type: res.type, 
            message: res.message,
            value: isNested ? '[Nested]' : val,
            ...(isNested && { children: res.children }) 
        };

        if (!res.valid) {
            report.valid = false;
            report.errors += (isNested ? res.errors : 1);
        }
    }

    // Strict key check
    if (strict) {
        Object.keys(data).filter(k => !schema.hasOwnProperty(k)).forEach(k => {
            const xPath = path ? `${path}.${k}` : k;
            report.flatErrors[xPath] = "Excess key not allowed";
            report.valid = false;
            report.errors++;
        });
    }

    // Only return flatErrors at the top-level call
    if (path !== '') return report; 
    return report;
};