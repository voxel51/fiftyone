import { useMemo } from "react";
import { localColorMask } from "./colorMask";
import type { CategoricalFilter } from "./legendFilter";
import type { ColorMeta, ColorValues } from "./protocol";

/**
 * Splits the App's filters between client and server: the color-by
 * field's filter is evaluated locally against the color column when
 * provably faithful (see colorMask.ts) — legend clicks then never wait
 * on the masks round trip — and everything else ships to the masks
 * endpoint as `serverFilters`.
 *
 * A locally-handled filter must not also reach the server (the whole
 * point is skipping that aggregation), and `serverFilters` is
 * identity-stabilized through JSON so a legend click — which only
 * changes the locally-handled entry — does not refetch the unchanged
 * remainder. Filters the client cannot evaluate faithfully fall back
 * to the server path untouched.
 */
export function useLocalColorMask(
  filters: unknown,
  colorField: string | null,
  colorValues: ColorValues | null,
  colorMeta: ColorMeta | null,
): {
  localMask: Uint8Array | null;
  serverFilters: Record<string, unknown>;
} {
  const localMask = useMemo(() => {
    if (!colorField || !colorValues || !colorMeta) return null;
    const fieldFilter = (filters as Record<string, CategoricalFilter> | null)?.[
      colorField
    ];
    if (!fieldFilter) return null;
    return localColorMask(fieldFilter, colorValues, colorMeta);
  }, [filters, colorField, colorValues, colorMeta]);

  const serverFiltersJson = useMemo(() => {
    const record = { ...((filters ?? {}) as Record<string, unknown>) };
    if (localMask && colorField) delete record[colorField];
    return JSON.stringify(record);
  }, [filters, localMask, colorField]);
  const serverFilters = useMemo(
    () => JSON.parse(serverFiltersJson) as Record<string, unknown>,
    [serverFiltersJson],
  );

  return { localMask, serverFilters };
}
