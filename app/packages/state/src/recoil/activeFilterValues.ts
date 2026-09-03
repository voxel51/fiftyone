import type { State } from "./types";

/**
 * Stable empty result, so a consumer's `useMemo` dependency on the return
 * value doesn't change identity every render while nothing is filtered.
 */
export const NO_VALUES: string[] = [];

/**
 * String values a filter set is currently filtering *for* at `path` —
 * inclusive selections only, empty when the filter is unset or set to exclude.
 *
 * The shape read here is the string filter's (`{ values, exclude }`), so this
 * applies to any path whose sidebar filter is a string filter. Non-string
 * filters at `path` yield an empty list rather than an error: a caller asking
 * "which values is this filtered to" gets "none it can name".
 *
 * Lives in its own module, free of the sidebar and graphQL machinery
 * `filters.ts` pulls in, so a test can run the real rule instead of standing a
 * copy of it up in a mock.
 */
export const activeFilterValues = (
  current: State.Filters | undefined,
  path: string,
): string[] => {
  const filter = current?.[path] as
    | { values?: (string | null)[]; exclude?: boolean }
    | undefined;
  if (!filter || filter.exclude) {
    return NO_VALUES;
  }
  const values = (filter.values ?? []).filter(
    (value): value is string => typeof value === "string",
  );
  return values.length ? values : NO_VALUES;
};
