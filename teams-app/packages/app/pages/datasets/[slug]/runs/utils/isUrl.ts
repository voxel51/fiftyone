export default function isURL(input: string): boolean {
  if (typeof input !== "string") {
    return false;
  }

  return /^https?:\/\//.test(input);
}
