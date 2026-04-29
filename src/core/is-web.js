/**
 * @file is-web.js
 * @description Web tooling for basic identity & regex-based validations.
 * @copyright 2026 Innovilage Technologies (INVT)
 * @license IOSL
 */

// Helper functions
// Checks single IPv4 octet (no dots/leading zeroes; 0 to 255)
const _isWeb_validOctet = (octet) => {
    const len = octet.length;
    if (len === 0 || len > 3) return false;
    if (len > 1 && octet[0] === '0') return false; // Leading zero

    // Fast numeric conversion (already guaranteed to contain only '0'-'9')
    let val = 0;
    for (let i = 0; i < len; i++) val = val * 10 + (octet.charCodeAt(i) - 48);
    return val <= 255;
};

// Checks single hex group (no colons/dots; 1 to 4 digits)
const _isWeb_hexGroup = (group) => {
    const len = group.length;
    if (len === 0 || len > 4) return false;
    for (let i = 0; i < len; i++) {
        const c = group.charCodeAt(i);
        // 0-9, A-F, a-f
        if ((c < 48 || c > 57) && (c < 65 || c > 70) && (c < 97 || c > 102)) return false;
    }
    return true;
};

/**
 * @param {string|number} input - IPv4 address to check
 * @returns {boolean}
 */
function _isWeb_validIPv4(input) {
    // Numeric (32-bit int)
    if (typeof input === 'number') return Number.isInteger(input) && input >= 0 && input <= 0xFFFFFFFF;

    // String
    if (typeof input !== 'string' || input.length === 0) return false;

    let dotCount = 0;
    let partStart = 0;
    const len = input.length;

    for (let i = 0; i < len; i++) {
        const ch = input[i];
        if (ch === '.') {
            // Empty part (e.g., leading dot, consecutive dots, trailing dot handled later)
            if (i === partStart) return false;
            if (!_isWeb_validOctet(input.substring(partStart, i))) return false;
            partStart = i + 1;
            dotCount++;
            if (dotCount > 3) return false; // Too many octets
        } else if (ch < '0' || ch > '9') {
            return false; // Illegal character
        }
    }

    // Trailing dot
    if (partStart === len) return false;

    // Validate last octet
    if (!_isWeb_validOctet(input.substring(partStart))) return false;

    return dotCount === 3; // Exactly three dots
}

/**
 * @param {string|bigint} input - IPv6 address to validate (accepts colon‑hex format, optional IPv4, "::")
 * @returns {boolean}
 */
function _isWeb_validIPv6(input) {
    // BigInt (128-bit int)
    if (typeof input === 'bigint') return input >= 0n && input < (1n << 128n);

    // String
    if (typeof input !== 'string') return false;
    const str = input;
    if (str.length < 2 || str.length > 39) return false; // Practical bounds

    // Must not contain triple colon
    if (str.includes(':::')) return false;

    const doubleColonPos = str.indexOf('::');
    let leftGroups = [], rightGroups = [];
    let omittedGroups; // number of zero groups that "::" represents

    if (doubleColonPos !== -1) {
        // Multiple "::" ?
        if (str.indexOf('::', doubleColonPos + 2) !== -1) return false;

        const leftStr = str.substring(0, doubleColonPos);
        const rightStr = str.substring(doubleColonPos + 2);

        // "::" cannot be directly adjacent to another colon
        if (leftStr.endsWith(':') || rightStr.startsWith(':')) return false;

        leftGroups = leftStr.length > 0 ? leftStr.split(':') : [];
        rightGroups = rightStr.length > 0 ? rightStr.split(':') : [];
    } else {
        // No "::" → exactly 8 hex groups, no embedded IPv4 allowed
        const allGroups = str.split(':');
        if (allGroups.length !== 8) return false;
        return allGroups.every(g => _isWeb_hexGroup(g));
    }

    // Validate left side (all must be pure hex groups)
    for (const g of leftGroups) if (!_isWeb_hexGroup(g)) return false;

    // Process right side – only the last element may be an IPv4 address
    let hexGroupsRight = rightGroups;
    let ipv4Part = null;

    if (rightGroups.length > 0) {
        const last = rightGroups[rightGroups.length - 1];
        if (last.includes('.')) {
            // The last segment is an embedded IPv4 address
            ipv4Part = last;
            hexGroupsRight = rightGroups.slice(0, -1);
        }
    }

    // Validate the hex groups on the right
    for (const g of hexGroupsRight) if (!_isWeb_hexGroup(g)) return false;

    // Validate optional embedded IPv4 using existing IPv4 fn
    if (ipv4Part !== null) if (!_isWeb_validIPv4(ipv4Part)) return false;

    // Total group equivalents = left hex + right hex + (IPv4 ? 2 : 0)
    const totalEquivalents = leftGroups.length + hexGroupsRight.length + (ipv4Part ? 2 : 0);

    // "::" must represent at least 1 omitted zero group
    if (totalEquivalents > 7) return false; // Would need more than 8 groups

    // All checks passed
    return true;
}

// Regex pattern constants
const _patterns = Object.freeze({
    // RFC 5322
    email_rfc_5322: /((?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|\"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*\")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\]))/i,

    // RFC 6532 (ES2015+)
    email_rfc_6532: /^(?<localPart>(?<dotString>[0-9a-z!#$%&'*+\-\/=?^_`\{|\}~\u{80}-\u{10FFFF}]+(\.[0-9a-z!#$%&'*+\-\/=?^_`\{|\}~\u{80}-\u{10FFFF}]+)*)|(?<quotedString>"([\x20-\x21\x23-\x5B\x5D-\x7E\u{80}-\u{10FFFF}]|\\[\x20-\x7E])*"))(?<!.{64,})@(?<domainOrAddressLiteral>(?<addressLiteral>\[((?<IPv4>\d{1,3}(\.\d{1,3}){3})|(?<IPv6Full>IPv6:[0-9a-f]{1,4}(:[0-9a-f]{1,4}){7})|(?<IPv6Comp>IPv6:([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,5})?::([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,5})?)|(?<IPv6v4Full>IPv6:[0-9a-f]{1,4}(:[0-9a-f]{1,4}){5}:\d{1,3}(\.\d{1,3}){3})|(?<IPv6v4Comp>IPv6:([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,3})?::([0-9a-f]{1,4}(:[0-9a-f]{1,4}){0,3}:)?\d{1,3}(\.\d{1,3}){3})|(?<generalAddressLiteral>[a-z0-9\-]*[[a-z0-9]:[\x21-\x5A\x5E-\x7E]+))\])|(?<Domain>(?!.{256,})(([0-9a-z\u{80}-\u{10FFFF}]([0-9a-z\-\u{80}-\u{10FFFF}]*[0-9a-z\u{80}-\u{10FFFF}])?))(\.([0-9a-z\u{80}-\u{10FFFF}]([0-9a-z\-\u{80}-\u{10FFFF}]*[0-9a-z\u{80}-\u{10FFFF}])?))*))$/iu,
    
    // E.164 International Phone Format (+1234567890)
    phone: /^\+?[1-9]\d{1,14}$/,
    
    // Alphanumeric names (allows for spaces, hyphens, and Unicode/accents)
    name: /^[\p{L}\s\-\.']+$/u,

    // NIST 800-63B Guidelines
    // ASCII range & between 8 and 64 chars
    // Needs additional verification with blacklist or database, i.e. HIBP
    pwd_nist: /^[\x20-\x7E]{8,64}$/,
    
    // Strong password: 8+ chars, 1 upper, 1 lower, 1 number, 1 special (max 128)
    pwd_standard: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$/u,

    // Emoji detection (ES2018+)
    emoji: /\p{Extended_Pictographic}/u,
    emoji_all: /^(\p{Extended_Pictographic}|\p{Emoji_Component})+$/u,

    // MAC address detection
    mac_addr: /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/,
    mac_addr_cisco_1: /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/,
    mac_addr_cisco_2: /^([0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}$/,
});

// Runtime type checker function
const _isWeb = Object.freeze({
    // Web
    emailStrict: (v) => typeof v === 'string' && v.length > 5 && v.length <= 254 && _is.safeString(v) && _patterns.email_rfc_5322.test(v),
    emailSafe:   (v) => typeof v === 'string' && v.length > 5 && v.length <= 512 && _is.safeString(v) && _patterns.email_rfc_6532.test(v),
    phone:       (v) => _is.safeString(v) && _patterns.phone.test(v),
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
    emoji: (v) => {
        if (typeof v !== 'string' || v.length === 0) return false;
        return _is.safeString(v) && _patterns.emoji_all.test(v);
    },
    hasEmoji:   (v) => typeof v === 'string' && _patterns.emoji.test(v),
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

    // Passwords
    // NIST 800-63B; must combine with other checks
    password:       (v) => typeof v === 'string' && _patterns.pwd_nist.test(v),
    // Standard 8 to 128 chars, one of each: lowercase, uppercase, number, special character
    passwordStrict: (v) => typeof v === 'string' && _patterns.pwd_standard.test(v),
    match:          (v, confirm) => v === confirm,

    // Networks
    ipv4:          (v) => _isWeb_validIPv4(v),
    ipv6:          (v) => _isWeb_validIPv6(v),
    macAddr:       (v) => _patterns.mac_addr.test(v),
    // Cisco dot‑notation (i.e. 0123.4567.89ab)
    macAddrCisco:  (v) => _patterns.mac_addr_cisco_1.test(v) || _patterns.mac_addr_cisco_2.test(v),

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
    custom: (v, regex) => regex instanceof RegExp && regex.test(v)
});