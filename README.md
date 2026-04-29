# FortisJS - Version 0.9.2

**[FOUNDATIONAL LIBRARY]** - as per IOSL licensing requirements.

This is a pure ECMAScript runtime **type-checking** and **parsing** library built by *Innovilage Technologies (INVT)* and published by the Innovilage Foundation (INVL).

Built on the *Unix Philosophy*, this is a low-level, high-performance toolkit designed for developers building AI frameworks, fintech engines, and IoT systems in JS. It prioritises *composability over configuration*, treating everything as a pure predicate which does **NOT** support automatic bundling nor NPM package managers.

This is done to protect the users while encouraging independent tree-shaking (for smaller code sizes) as well as code reviews before inclusion into a project.

**NOTE:** While this library is already used in production, it is still in the pre-v1 phase where some parts might need additional scrutiny or caution before use.

## The Philosophy

*Maximal Flexibility, Minimal Surface Area*

This library achieves near-maximum theoretical flexibility by not building a framework around its many functionalities - and instead opts for a custom compositional format that allows developers to include only the necessary files or even remove parts of the code where they think is not needed.

- **No Plugin System** because predicates are the plugin system.
- **No Configuration Objects** because functions compose better than complex JSON objects.
- **No Adapter Layer** because everything is a simple, pure function.
- **No Middleware Pipeline** because you can wrap any function.
- **No Dependency Injection** because modules are already decoupled.

The only limit to what this library can validate is your ability to build a pipeline or write a predicate function. In addition, the library was designed so that it can be:

- **Wrapped** in any framework
- **Composed** with any logic
- **Extended** with any function
- **Integrated** with any system
- **Optimised** for any use case

## Performance & Safety

- **Zero Dependencies** - Keep your bundle small and your supply chain secure.
- **Security-Focused** - Built-in protection against prototype pollution and null-byte injections.
- **Bit-Level Precision** - Endian-aware DataView and BigInt operations for 64-bit precision.
- **ES2026 Support** - Uses the latest ```ES2026``` standard with some* custom fallback protections.
- **Non-NPM Packaging** - Does not support NPM to encourage code vetting, manual integration, and prevent supply chain attacks.
- **System Uniformity** - It allows you to achieve *full-stack type symmetry*: from frontend input checks to backend type validation to database schema.

## Deployment

This project is split into composable modules. The core file that is needed is `core/is.js`, while everything else is based on this file and add additional functionalities to the core logic.

While all additional modules follows this rule/structure:\
`core/is-[module-name].js` handles the core module logic, and\
`parser/parse-[module-name].js` is dependent on the first .js file.

**CORE MODULES**
- `core/is.js` Pure type checking; stateless, minimal side-effects (**required** for all submodules)
- `parser/parse.js` Type coercion; value transformation for all `is.js` validators
- `core/is-web.js` - Web standards validation module for any given format such as emails, passwords, IBAN, ISBN, etc. (with custom regex composer)
- `schema/is-schema.js` - A special single-file that allows you to use all `is-` functions within a validation scheme.

**AI/ML MODULES**
- `core/is-quant.js` Quantised format checking or numerical validation (e.g., NF4, FP8-E4M3, BF16, etc.)
- `parser/parse-quant.js` - Quantised format coercion; numerical transformation that 'coerces' any numeric value into the nearest *valid* numeric value for that format

**FLOATING POINT MODULES**
- `core/is-float.js` - Floating point precision type checking for `f4`, `f6`, `f8`, `f16`, `f32`, and JS-native `f64`
- `parser/parse-float.js` - Floating point precision coercion; checks whether a value is valid for a particular precision type

## Usage/Examples

**Basic Typechecking**
```javascript
let myText = 'Hello world';
let isValidText = _is.string(myText); // true

let myNumber = 123;
let isValidFloat = _is.float(myNumber); // false
```

**Integer Checks**
```javascript
let age = 33; // 0 to 255
let isValidAge = _is.u8(age); // true
```

**Safety Checks**
```javascript
let unfilteredText = 'Hello worlds';
let isValidText = _is.safeString(unfilteredText); // true
```

**Type-Safe Binary Protocol Parsing**
```javascript
const rawBytes = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);

let myString = _parse.string(raw, true);     // "Hello"
let myArray = _parse.u8Array(raw, true);     // Uint8Array[5]
let myNumber = _parse.i32(raw.buffer, true); // 1819043144
```

**Number Parsing**
```javascript
// "1,234.56" to 1234 to 1234n (BigInt)
const cents = _parse.i64("1,234.56", true); // Rounds via first decimal

// Hex string to typed integer
const flags = _parse.u32("0xFF00AA", true); // 16711850
```

**Cross-Domain Validation**
```javascript
// AI model weights validation
const modelSchema = {
    weights: (v) => _is.f32Array(v) && v.every(w => _isQuant.f8_E4M3(w)),
    architecture: _is.safeString,
    parameters: _is.u64
};

console.log(_validate(data, modelSchema, true));

// Fintech payment validation
const paymentSchema = {
    amount: _is.u128,
    currency: (v) => _is.safeString(v) && v.length === 3,
    card: _isWeb.creditCard
};

console.log(_validate(data, paymentSchema));
```

**Mixed-Precision Simulation**
```javascript
// Simulate FP8 forward pass, FP16 accumulation
const mySchema = {
    weights: _isQuant.f8_E4M3,         // H100 FP8 format
    gradients: _isQuant.f16_IEEE,      // FP16 accumulation
    master_weights: _isQuant.f32_IEEE  // FP32 master copy
};

// Coerce values to target precisions
const quantisedWeights = weights.map(w => _parseQuant.f8_E4M3(w));
```

**Mix-and-Match**
```javascript
const myHybridSchema = {
    payment: _isWeb.creditCard,                   // Financial domain
    confidence: _isQuant.bf16,                    // AI domain
    userId: _is.u64,                              // Core type system
    amount: (v) => _isWeb.iban(v) || _is.u128(v), // Custom combination
};
```

**Sample Predicate Pattern**\
*Everything is a predicate so we can do monadic composition without the ceremony - giving you the most flexible abstraction possible.*
```javascript
// All validators use the same signature: (value) => boolean
_is.string(v)
_isWeb.emailStrict(v)
_isQuant.nf4(v)

// Therefore, they compose with standard logic
const and = (...fns) => v => fns.every(f => f(v));
const or  = (...fns) => v => fns.some(f => f(v));
const not = (fn) => v => !fn(v);

// Create custom validators without modifying the library
const businessEmail = and(
    _isWeb.emailStrict,
    v => v.endsWith('@company.com'),
    v => v.length < 100
);

const secureNullableString = or(
    _is.null,
    _is.safeString
);
```

## Extensibility Vectors

Following our above-mentioned monadic composition examples, we can further extend the basic functionality of this library through the different module subsystems.

**Through the Schema System**
```javascript
const mySchema = {
    // Built-in validators
    email: _isWeb.emailStrict,
    
    // Custom predicate
    username: (v) => _is.safeString(v) && !BLOCKED_USERNAMES.has(v),
    
    // Async validation (requires is-web.js module)
    emailUnique: {
        check: (v) => _isWeb.emailStrict(v),
        // Example only: you could build custom functions to handle this:
        async: (v) => db.emails.isUnique(v),
    },
    
    // Cross-field validation
    password: _isWeb.match(data.pwd, data.confirm),
};
```

**Through the Parse/Coerce System**\
*The `_parse` factory generates coercion functions for any type in `_is`. Add your own custom function in `is.js` and update the `_configs` in `parse.js` to achieve custom functionality like below:*
```javascript
// Add a new type to _is and _configs, and _parse automatically handles it
_is.customType = (v) => typeof v === 'string' && v.startsWith('CUST-');
_configs.customType = [(v) => `CUST-${v}`, 'CUST-DEFAULT'];

// Now you get automatic parsing for free
_parse.customType("123", true); // → "CUST-123"
_parse.customType("invalid", true); // → "CUST-DEFAULT" (with warning)
```

**Through the Quantization LUT System**
```javascript
// Generate validation for any custom float format
const myCustomFP9 = _genLUTSmallMeta(
    _genLUTSmall(9, 4, 4, 7, false, true),
    4
);

// Add to `_isQuant` to register it as validator
fp9_custom: (v) => _isSmallQValidFast(v, myCustomFP9),

// Add to `_parseQuant` to register it as parser
fp9_custom: (v) => _parseSmallQ(v, myCustomFP9),

// Now, you can use it anywhere
_isQuant.fp9_custom(0.345);
_parseQuant.fp9_custom(0.345); // to nearest FP9 value
```
## Integration Vectors

**With TypeScript**
```javascript
// The predicates naturally map to type guards
const isEmail = (v: unknown): v is string => _isWeb.emailSafe(v);

// Schema validation becomes type narrowing
if (_validate(data, schema).valid) {
    // Data is now known to match schema shape
}
```

**With React Form Validation**
```javascript
const validateField = (value, fieldName) => {
    const check = fieldSchemas[fieldName];
    const result = _validate({ [fieldName]: value }, { [fieldName]: check });
    return result.flatErrors[fieldName] || null;
};
```

**With Express/API Middleware**
```javascript
const validateBody = (schema) => (req, res, next) => {
    const result = _validate(req.body, schema, true);
    if (!result.valid) {
        return res.status(400).json({ errors: result.flatErrors });
    }
    next();
};

app.post('/users', validateBody(userSchema), createUser);
```

**With WebAssembly/WebGPU**
```javascript
// Validate GPU buffer contents
const validateGPUBuffer = (buffer, format) => {
    const view = _parse[`${format}Array`](buffer, true);
    return view.every(val => _isQuant[format](val));
};
```

## FAQ

#### Is this library production-ready?

While some parts of the code is already used in production systems such as `is.js`, other parts such as `is-float.js` or `is-quant.js` are still in its infancy and require more unit as well as real-world testing and validation.

#### How do I contribute?

We welcome all PRs and bug-fix submissions (e.g., maths, algorithms, logic, etc.) that help us make this library better and more usable for all. The idea is to maximize developer experience (DX) and build a composable and ergonomic API.

## License

FortisJS is licensed under the [IOSL (Innovilage Open Source License)](https://www.invl.org/open-source/innovilage-open-source-license.html).

(C) Copyright 2026 Innovilage Technologies, Inc.