export type CharacterOptions = { lowercase: boolean; uppercase: boolean; numbers: boolean; symbols: boolean };
export const DEFAULT_CHARACTER_OPTIONS: CharacterOptions = { lowercase: true, uppercase: true, numbers: true, symbols: true };
const sets: Record<keyof CharacterOptions, string> = { lowercase: "abcdefghijklmnopqrstuvwxyz", uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789", symbols: "!@#$%^&*()-_=+[]{};:,.?" };

// Selected classes are allowed, not guaranteed. Rejection sampling avoids modulo bias.
export function generatePassword(length: number, options: CharacterOptions,
  random: (values: Uint32Array) => Uint32Array = values => crypto.getRandomValues(values)): string {
  if (!Number.isInteger(length) || length < 8 || length > 64) throw new Error("Length must be 8–64.");
  let characters = "";
  for (const name of Object.keys(sets) as Array<keyof CharacterOptions>) {
    if (typeof options[name] !== "boolean") throw new Error("Invalid character options.");
    if (options[name]) characters += sets[name];
  }
  if (!characters) throw new Error("Choose at least one character type.");
  const limit = 2 ** 32 - (2 ** 32 % characters.length);
  let password = "";
  // A defensive cap prevents a faulty test/randomness provider from hanging.
  for (let round = 0; password.length < length && round < 1024; round++) {
    const values = random(new Uint32Array(length - password.length));
    for (const value of values) if (value < limit) password += characters[value % characters.length];
    values.fill(0);
  }
  if (password.length !== length) throw new Error("Randomness unavailable.");
  return password;
}
