import { describe, expect, it } from "vitest";
import { generatePassword, DEFAULT_CHARACTER_OPTIONS } from "@password-manager/shared";

describe("shared cryptographic generator", () => {
  it.each([8, 20, 64])("generates exact length %s", length => expect(generatePassword(length, DEFAULT_CHARACTER_OPTIONS)).toHaveLength(length));
  it.each(["lowercase", "uppercase", "numbers", "symbols"] as const)("uses only selected %s", name => {
    const patterns = { lowercase: /^[a-z]+$/, uppercase: /^[A-Z]+$/, numbers: /^[0-9]+$/, symbols: /^[!@#$%^&*()\-_=+\[\]{};:,.?]+$/ };
    const options = { lowercase: false, uppercase: false, numbers: false, symbols: false, [name]: true };
    expect(generatePassword(64, options)).toMatch(patterns[name]);
  });
  it.each([0, 7, 65, 10.5, NaN])("rejects length %s", length => expect(() => generatePassword(length, DEFAULT_CHARACTER_OPTIONS)).toThrow());
  it("rejects empty options and a faulty provider", () => {
    expect(() => generatePassword(8, { lowercase: false, uppercase: false, numbers: false, symbols: false })).toThrow();
    expect(() => generatePassword(8, { lowercase: true, uppercase: false, numbers: false, symbols: false }, values => values.fill(0xffffffff))).toThrow("Randomness unavailable");
  });
  it("rejects biased tail values and draws again", () => {
    let draws = 0;
    const password = generatePassword(8, { lowercase: true, uppercase: false, numbers: false, symbols: false }, values => values.fill(draws++ === 0 ? 0xffffffff : 1));
    expect(password).toBe("bbbbbbbb"); expect(draws).toBe(2);
  });
});
