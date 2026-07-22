/**
 * Returns a trimmed string only when it still has content.
 */
export function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
