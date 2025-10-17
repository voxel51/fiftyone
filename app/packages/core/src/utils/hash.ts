/**
 * Return the SHA-256 hash of the input as a hex string.
 *
 * @param input Hash input
 */
export const generateHash = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16))
    .join("");
};
