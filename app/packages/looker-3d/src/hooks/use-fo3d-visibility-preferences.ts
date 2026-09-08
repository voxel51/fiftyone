import { useBrowserStorage } from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import {
  getAuthoredVisibilityMap,
  getVisibilityMapFromFo3dParsed,
} from "../fo3d/utils";
import type { FoScene } from "../fo3d/render-types";

export const FO3D_NODE_VISIBILITY_STORAGE_KEY = "fo3d-nodeVisibility";

/**
 * Keeps only the boolean entries of a leva values object.
 *
 * The visibility panel is all booleans, but leva hands back whatever is in the
 * folder, so this guards the persisted payload against anything unexpected
 * ending up in there.
 */
export const pickBooleanEntries = (
  values: Record<string, unknown> | null | undefined,
): Record<string, boolean> => {
  if (!values) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
};

/**
 * Persists the scene's per-node visibility toggles across refreshes.
 *
 * Node visibility is the one render preference with no backing app state — it
 * lives entirely in leva's store — so a refresh used to restore every hidden
 * node, point clouds included. This seeds leva's schema from storage instead.
 *
 * Keyed by node name in one global entry, alongside the other viewer
 * preferences (`fo3dAutoRotate` and friends) rather than per dataset: the
 * intent "keep the point cloud hidden" travels with the node, so it should hold
 * as you move between samples. A saved name that isn't in the current scene is
 * ignored (see `getVisibilityMapFromFo3dParsed`), so an unrelated graph falls
 * back to its authored defaults.
 */
export const useFo3dVisibilityPreferences = (scene: FoScene | null) => {
  const [storedVisibility, setStoredVisibility] = useBrowserStorage<
    Record<string, boolean>
  >(FO3D_NODE_VISIBILITY_STORAGE_KEY, {});

  // Read through a ref so persisting doesn't feed back into the schema below:
  // rebuilding it mid-session would reset leva's inputs under the user.
  const storedVisibilityRef = useRef(storedVisibility);
  storedVisibilityRef.current = storedVisibility;

  const visibilitySchema = useMemo(
    () => getVisibilityMapFromFo3dParsed(scene, storedVisibilityRef.current),
    [scene],
  );

  // The scene's own defaults, ignoring any saved preference. Only a control
  // value that diverges from this baseline is a user's explicit choice and
  // worth persisting -- otherwise every untouched authored default gets
  // written to storage on mount, permanently shadowing that node's authored
  // default the next time a different scene reuses the same node name.
  const authoredVisibilityRef = useRef<Record<string, boolean>>({});
  authoredVisibilityRef.current = useMemo(
    () => getAuthoredVisibilityMap(scene),
    [scene],
  );

  // Serialized snapshot of the last write. leva returns a fresh values object on
  // every render, so without this the persist-on-change effect would write, ,
  // re-render, and write again forever.
  const lastPersistedRef = useRef<string | null>(null);

  const persistVisibility = useCallback(
    (values: Record<string, unknown> | null | undefined) => {
      const booleans = pickBooleanEntries(values);

      if (Object.keys(booleans).length === 0) {
        return;
      }

      const authored = authoredVisibilityRef.current;
      const overrides = Object.fromEntries(
        Object.entries(booleans).filter(
          ([name, value]) => authored[name] !== value,
        ),
      );

      const serialized = JSON.stringify(overrides);

      if (serialized === lastPersistedRef.current) {
        return;
      }

      lastPersistedRef.current = serialized;
      setStoredVisibility((previous) => {
        const next = { ...previous };

        for (const name of Object.keys(booleans)) {
          if (name in overrides) {
            next[name] = overrides[name];
          } else {
            delete next[name];
          }
        }

        return next;
      });
    },
    [setStoredVisibility],
  );

  return { visibilitySchema, persistVisibility };
};
