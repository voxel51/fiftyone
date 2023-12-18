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
  return parseInt(value, 16).toString(16) === value;
}

export function isObjectIdString(value: string) {
  return isHex(value) && value.length === 24;
}

export type NumberKeyObjectType<V = unknown> = {
  [key: string]: V;
};

const PRIMITIVE_TYPES = ["string", "number", "boolean"];
