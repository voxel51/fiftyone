/** Tests whether any stream metadata contains a trimmed query, ignoring case. */
export function matchesEpisodeStreamFilter(
  filter: string,
  ...values: readonly (string | null | undefined)[]
): boolean {
  const needle = filter.trim().toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(needle));
}
