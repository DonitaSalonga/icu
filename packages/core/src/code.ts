// Session codes (R4). The database generates codes in create_session with the same alphabet;
// test/sql-parity.test.ts checks the two stay identical.

/** 32 characters: A–Z without I and O, digits 2–9 (no look-alikes 0/O, 1/I). */
export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SESSION_CODE_LENGTH = 6;
export const SESSION_CODE_RE = new RegExp(`^[${SESSION_CODE_ALPHABET}]{${SESSION_CODE_LENGTH}}$`);

export function generateSessionCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += SESSION_CODE_ALPHABET[Math.floor(random() * SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

/** Normalises user input: trims, uppercases, removes spaces and dashes. */
export function normalizeSessionCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}
