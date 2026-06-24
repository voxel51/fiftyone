export function positiveIntegerOption({
  context,
  defaultValue,
  name,
  value,
}: {
  readonly context: string;
  readonly defaultValue: number;
  readonly name: string;
  readonly value: number | undefined;
}): number {
  if (value === undefined) {
    return defaultValue;
  }
  if (Number.isFinite(value) && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new Error(`${context} requires a positive integer ${name}`);
}
