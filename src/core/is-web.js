/**
 * @file is-web.js
 * @description Web tooling for regex-based validations.
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

const _patterns = Object.freeze({
    // RFC 5322
    email_rfc_5322: /^(?=.{1,64}@)((?:[A-Za-z0-9!#$%&'*+-/=?^\{\|\}~]+|"(?:\\"|\\\\|[A-Za-z0-9\.!#\$%&'\*\+\-/=\?\^_{|}~ (),:;<>@[].])+")(?:.(?:[A-Za-z0-9!#$%&'*+-/=?^\{\|\}~]+|"(?:\\"|\\\\|[A-Za-z0-9\.!#\$%&'\*\+\-/=\?\^_{|}~ (),:;<>@[].])+")))@(?=.{1,255}.)((?:[A-Za-z0-9]+(?:(?:[A-Za-z0-9-][A-Za-z0-9])?).)+[A-Za-z]{2,})|(((0|[1-9A-Fa-f][0-9A-Fa-f]{0,3}):){0,6}(0|)])$/,

    // RFC 6532
    email_rfc_6532: /^(?<localPart>(?<dotString>[0-9a-z!#$%&'*+\-\/=?^_`\{|\}~\u{80}-\u{10FFFF}]+(\.[0-9a-z!#$%&'*+\-\/=?^_`\{|\}~\u{80}-\u{10FFFF}]+)*)|(?<quotedString>"([\x20-\x21\x23-\x5B\x5D-\x7E\u{80}-\u{10FFFF}]|\\[\x20-\x7E])*"))(?<!.{64,})@(?<domainOrAddressLiteral>(?<addressLiteral>\[((?<IPv4>\d{1,3}(\.\d{1,3}){3})|(?<IPv6Full>IPv6:[0-9a-f]{1,4}(:[0-9a-f]{1,4}){7})|(?<IPv6Comp>IPv6:([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,5})?::([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,5})?)|(?<IPv6v4Full>IPv6:[0-9a-f]{1,4}(:[0-9a-f]{1,4}){5}:\d{1,3}(\.\d{1,3}){3})|(?<IPv6v4Comp>IPv6:([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,3})?::([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,3}:)?\d{1,3}(\.\d{1,3}){3})|(?<generalAddressLiteral>[a-z0-9\-]*[[a-z0-9]:[\x21-\x5A\x5E-\x7E]+))\])|(?<Domain>(?!.{256,})(([0-9a-z\u{80}-\u{10FFFF}]([0-9a-z\-\u{80}-\u{10FFFF}]*[0-9a-z\u{80}-\u{10FFFF}])?))(\.([0-9a-z\u{80}-\u{10FFFF}]([0-9a-z\-\u{80}-\u{10FFFF}]*[0-9a-z\u{80}-\u{10FFFF}])?))*))$/iu,
    
    // E.164 International Phone Format (+1234567890)
    phone: /^\+?[1-9]\d{1,14}$/,
    
    // Alphanumeric names (allows for spaces, hyphens, and Unicode/Accents)
    name: /^[\p{L}\s\-\.']+$/u,
    
    // Strong password: 8+ chars, 1 upper, 1 lower, 1 number, 1 special
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d./@$!%*?&]{8,}$/,

    // NIST 800-63B Guidelines
    // ASCII range & between 8 and 64 chars
    // Needs additional verification with blacklist or database, i.e. HIBP
    pwd_nist: /^[\x20-\x7E]{8,64}$/,
});

// Runtime type checker function
const _isWeb = Object.freeze({
    // Web
    emailStrict: (v) => typeof v === 'string' && v.length > 5 && v.length <= 254 && _is.safeString(v) && _patterns.email_rfc_5322.test(v),
    emailSafe: (v) => typeof v === 'string' && v.length > 5 && v.length <= 512 && _is.safeString(v) && _patterns.email_rfc_6532.test(v),
    phone: (v) => _is.safeString(v) && _patterns.phone.test(v),
    name: (v, min = 2, max = 50) => {
        if (!_is.safeString(v)) return false;
        const len = v.trim().length;
        return len >= min && len <= max && _patterns.name.test(v);
    },
    safeUrl: (v) => {
        try {
            return ['https:', 'ftps:', 'mailto:'].includes(new URL(v).protocol);
        } catch { return false }
    },
    creditCard: (v) => { // Luhn Algorithm
        if (typeof v !== 'string') return false;
        const d = v.replace(/\D/g, ''); // Strip non-digits
        if (d.length < 13 || d.length > 19) return false;
        let s = 0, b = false;
        for (let i = d.length - 1; i >= 0; i--) {
            let n = parseInt(d[i], 10);
            if (b && (n *= 2) > 9) n -= 9;
            s += n; b = !b;
        }
        return s % 10 === 0;
    },

    // Specialised Contexts
    iban: (v) => { // Validates length, country code & Mod-97 checksum (ISO 7064)
        if (typeof v !== 'string') return false;
        const clean = v.replace(/[^A-Z0-9]/g, '').toUpperCase();
        if (clean.length < 4 || clean.length > 34) return false;

        // Move first 4 chars to end
        const rearranged = clean.slice(4) + clean.slice(0, 4);
        
        // Convert letters to numbers (A=10, B=11, ..., Z=35)
        let numeric = '';
        for (let i = 0; i < rearranged.length; i++) {
            const code = rearranged.charCodeAt(i);
            numeric += (code >= 65 && code <= 90) ? (code - 55).toString() : rearranged[i];
        }

        // Perform Mod-97 on large numeric string
        let remainder = 0;
        for (let i = 0; i < numeric.length; i += 7) {
            const chunk = remainder.toString() + numeric.substring(i, i + 7);
            remainder = parseInt(chunk, 10) % 97;
        }
        return remainder === 1;
    },
    isbn: (v) => { // Supports ISBN-10 and 13
        if (typeof v !== 'string') return false;
        const d = v.replace(/[- ]/g, '').toUpperCase();
        
        // ISBN-10
        if (d.length === 10) {
            let sum = 0;
            for (let i = 0; i < 9; i++) {
                const n = parseInt(d[i], 10);
                if (isNaN(n)) return false;
                sum += n * (10 - i);
            }
            const last = d[9] === 'X' ? 10 : parseInt(d[9], 10);
            return (sum + last) % 11 === 0;
        }
        
        // ISBN-13
        if (d.length === 13) {
            let sum = 0;
            for (let i = 0; i < 12; i++) {
                const n = parseInt(d[i], 10);
                if (isNaN(n)) return false;
                sum += n * (i % 2 === 0 ? 1 : 3);
            }
            const checkDigit = (10 - (sum % 10)) % 10;
            return checkDigit === parseInt(d[12], 10);
        }
        
        return false;
    },

    // Miscellaneous
    custom: (v, regex) => regex.test(v)
});