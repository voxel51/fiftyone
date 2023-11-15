export function isPrimitiveString(value: unknown) {
  return typeof value === "string";
}

export function isNullish(value) {
  return value === undefined || value === null;
}
