function decodeIEEE754_4bit(binaryValue) {
    // 4-bit float: 1 sign bit, 2 exponent bits (bias=1), 1 mantissa bit
    // No infinity - all exponent values represent numbers
    const sign = (binaryValue >> 3) & 1;
    const exponent = (binaryValue >> 1) & 3;
    const mantissa = binaryValue & 1;
    
    if (exponent === 0) {
        // Subnormal: (-1)^sign * 2^(-1) * (0.mantissa)
        return (sign ? -1 : 1) * Math.pow(2, -1) * (mantissa * 0.5);
    } else {
        // Normal: (-1)^sign * 2^(exponent-1) * (1.mantissa)
        return (sign ? -1 : 1) * Math.pow(2, exponent - 1) * (1 + mantissa * 0.5);
    }
}

const f4_IEEE = new Float32Array([0b0000, 0b0001, 0b0010, 0b0011, 0b0100, 0b0101, 0b0110, 0b0111, 0b1000, 0b1001, 0b1010, 0b1011, 0b1100, 0b1101, 0b1110, 0b1111]);

for (let i = 0; i < f4_IEEE.length; i++) {
    f4_IEEE[i] = decodeIEEE754_4bit(f4_IEEE[i]);
}

// Sort TypedArray by values
f4_IEEE.sort();

// Clean into string and console.log
console.log(JSON.stringify(Array.from(f4_IEEE)));