export function getType(value: any) {
  const basicType = typeof value;
  if (basicType !== "object") return basicType;
  const constructorName = value?.constructor?.name;
  if (constructorName) return constructorName;
  return "Unknown";
}

export const OBJECT_VALUE_TYPE = "Object";
