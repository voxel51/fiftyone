/** Tests whether any topic metadata contains a trimmed query, ignoring case. */
export function matchesMcapTopicFilter(
  filter: string,
  ...values: readonly (string | null | undefined)[]
): boolean {
  const needle = filter.trim().toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(needle));
}
