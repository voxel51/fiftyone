export function isPrimitiveString(value: unknown) {
  return typeof value === "string";
}

export function isNullish(value) {
  return value === undefined || value === null;
}

export function isPrimitiveType(type: string) {
  return PRIMITIVE_TYPES.includes(type);
}

export function isHex(value: string) {
  return /[0-9a-f]{24}/g.test(value);
}

export function isObjectIdString(value: string, strict = true) {
  return isHex(value) && strict ? value.length === 24 : value.length <= 24;
}

export type NumberKeyObjectType<V = unknown> = {
  [key: string]: V;
};

const PRIMITIVE_TYPES = ["string", "number", "boolean"];
