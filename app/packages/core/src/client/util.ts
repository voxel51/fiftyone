/**
 * Generate a URI from the path parts using URL-safe encoding.
 *
 * @param parts Path parts
 */
export const encodeURIPath = (parts: string[]): string => {
  const encoded = parts.map((part) => encodeURIComponent(part)).join("/");
  return `/${encoded}`;
};
