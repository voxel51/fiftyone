import { useTileId } from "@fiftyone/tiling";
import { atom, useAtom, type SetStateAction } from "jotai";
import { useCallback } from "react";

/** Opaque extension settings indexed by their host-assigned tile id. */
export type EpisodeTileExtensionSettingsByTile = Readonly<
  Record<string, unknown>
>;

/** Host-owned settings table persisted alongside the episode layout. */
export const episodeTileExtensionSettingsAtom =
  atom<EpisodeTileExtensionSettingsByTile>({});

/**
 * Returns one contributed tile's opaque, JSON-safe settings value.
 * Validation remains extension-owned; the host only scopes and persists it.
 */
export function useEpisodeTileExtensionSettings<Value>(
  defaultValue: Value,
): readonly [Value, (value: SetStateAction<Value>) => void] {
  const tileId = useTileId();
  const [byTile, setByTile] = useAtom(episodeTileExtensionSettingsAtom);
  const value =
    tileId && Object.hasOwn(byTile, tileId)
      ? (byTile[tileId] as Value)
      : defaultValue;
  const setValue = useCallback(
    (next: SetStateAction<Value>) => {
      if (!tileId) return;
      setByTile((previous) => {
        const current = Object.hasOwn(previous, tileId)
          ? (previous[tileId] as Value)
          : defaultValue;
        const resolved =
          typeof next === "function"
            ? (next as (value: Value) => Value)(current)
            : next;
        return Object.is(resolved, current)
          ? previous
          : { ...previous, [tileId]: resolved };
      });
    },
    [defaultValue, setByTile, tileId],
  );
  return [value, setValue] as const;
}
