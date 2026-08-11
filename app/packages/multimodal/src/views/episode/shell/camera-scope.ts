/** Stable collision-free identity for camera state within one media field. */
export function cameraScopeKey(
  datasetOrSourceId: string | undefined,
  mediaField: string | undefined,
): string | null {
  const scope = datasetOrSourceId?.trim();
  if (!scope) return null;
  const field = mediaField?.trim();

  return JSON.stringify([scope, field ? ["field", field] : ["default"]]);
}
