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
  filters: Record<string, unknown> | null | undefined,
  /** The color-by field's key in the filters record — the grid-view
   * vocabulary path (see filterPath.ts), not necessarily the root
   * color-by path */
  filterPath: string | null,
  colorValues: ColorValues | null,
  colorMeta: ColorMeta | null,
): {
  localMask: Uint8Array | null;
  serverFilters: Record<string, unknown>;
} {
  // Null always means "let the server handle it", never "empty mask":
  // the mask exists only when the color-by field is filtered AND that
  // filter is locally evaluable
  const localMask = useMemo(() => {
    if (!filterPath || !colorValues || !colorMeta) return null;

    const candidate = filters?.[filterPath];
    if (typeof candidate !== "object" || candidate === null) return null;

    // Object-ness is the only narrowing needed: localColorMask
    // validates the actual shape at runtime and returns null for
    // anything it cannot evaluate faithfully
    return localColorMask(
      candidate as CategoricalFilter,
      colorValues,
      colorMeta,
    );
  }, [filters, filterPath, colorValues, colorMeta]);

  // Everything except a locally-masked color filter goes to the
  // server. `filters` is a fresh object on every store write, so
  // stability comes from serializing: the parse below re-runs only
  // when the serialized remainder CHANGES — a legend click, which
  // touches only the locally-handled entry, keeps `serverFilters`
  // reference-equal and the masks fetch does not re-fire
  const serverFiltersJson = useMemo(() => {
    const remainder: Record<string, unknown> = { ...filters };
    if (localMask && filterPath) {
      delete remainder[filterPath];
    }
    return JSON.stringify(remainder);
  }, [filters, localMask, filterPath]);

  const serverFilters = useMemo(
    () => JSON.parse(serverFiltersJson) as Record<string, unknown>,
    [serverFiltersJson],
  );

  return { localMask, serverFilters };
}
