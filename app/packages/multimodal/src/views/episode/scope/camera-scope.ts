/** Stable collision-free preference identity within one dataset/media field. */
export function cameraScopeKey(
  datasetOrSourceId: string | undefined,
  mediaField: string | undefined,
): string | null {
  const scope = datasetOrSourceId?.trim();
  if (!scope) return null;
  const field = mediaField?.trim();

  return JSON.stringify([scope, field ? ["field", field] : ["default"]]);
}
