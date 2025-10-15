import { useMemo } from "react";

/**
 * Get the hex string for a SHA-256 hash of the provided data.
 *
 * @param data Data to hash
 */
export const sha256 = async (data: string): Promise<string> => {
  const encoded = new TextEncoder().encode(data);
  const buffer = await window.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16))
    .join("");
};

/**
 * Get a version token for use in mutation APIs.
 *
 * @param source Token source
 */
export const useVersionToken = ({
  source,
}: {
  source: string;
}): Promise<string | null> => {
  return useMemo(() => {
    if (!source) {
      return Promise.resolve(null);
    }

    return sha256(source);
  }, [source]);
};
