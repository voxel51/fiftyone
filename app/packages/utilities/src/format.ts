export function formatValueAsNumber(
  value: string | number,
  fractionDigits = 3
) {
  const numericValue =
    typeof value === "number" ? value : parseFloat(value as string);
  if (!isNaN(numericValue) && numericValue == value) {
    return parseFloat(numericValue.toFixed(fractionDigits));
  }
  return value;
}
