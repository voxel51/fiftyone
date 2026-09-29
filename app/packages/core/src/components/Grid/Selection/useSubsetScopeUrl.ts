import {
  getSubset,
  selectionDomainId,
  useGridSelectionDataset,
  useSelectionBoundary,
  viewConversion,
  type SelectionBoundary,
} from "@fiftyone/state/src/selection";
import { useEffect, useRef } from "react";
import {
  useUrlSearch,
  writeUrlSearch,
} from "../../../url/useUrlSearchSubscription";
import { useOpenSubset } from "./useSubsetScope";

type Scope = Pick<SelectionBoundary, "subsetId" | "subsetScope">;
const STORAGE_PREFIX = "fiftyone:grid-scope:";

function scopeKey(scope: Scope): string {
  return scope.subsetId
    ? JSON.stringify([scope.subsetId, scope.subsetScope ?? "episodes"])
    : "";
}

function readPreference(datasetId: string): Scope {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_PREFIX + datasetId) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "subsetId" in value &&
      typeof value.subsetId === "string"
    ) {
      return {
        subsetId: value.subsetId,
        subsetScope:
          "subsetScope" in value && value.subsetScope === "segments"
            ? "segments"
            : "episodes",
      };
    }
  } catch {
    // A blocked or malformed preference must not prevent URL navigation.
  }
  return {};
}

function persist(datasetId: string, scope: Scope) {
  try {
    const key = STORAGE_PREFIX + datasetId;
    if (scope.subsetId) localStorage.setItem(key, JSON.stringify(scope));
    else localStorage.removeItem(key);
  } catch {
    // The URL and in-memory scope still work when storage is unavailable.
  }
  const params = new URLSearchParams(window.location.search);
  params.delete("subset");
  params.delete("subsetScope");
  if (scope.subsetId) {
    params.set("subset", scope.subsetId);
    if (scope.subsetScope === "segments") params.set("subsetScope", "segments");
  }
  if (params.toString() !== window.location.search.replace(/^\?/, "")) {
    writeUrlSearch(params.toString());
  }
}

interface SyncedScope {
  datasetId: string;
  domainId: string;
  pathname: string;
  scope: string;
  url: string;
  boundary: SelectionBoundary;
}

/**
 * A URL subset wins on entry; otherwise restore this dataset's last scope.
 * Afterwards URL navigation and scope commands both update the other side.
 * Only the subset boundary is persisted, never sidebar constraints/captures.
 */
export function useSubsetScopeUrl() {
  const { datasetId, domainId, enabled } = useGridSelectionDataset();
  const [boundary, setBoundary] = useSelectionBoundary(domainId);
  const openSubset = useOpenSubset(datasetId);
  const search = useUrlSearch();
  const previous = useRef<SyncedScope | null>(null);
  const transitioning = useRef<{
    datasetId: string;
    from: string;
    boundary: SelectionBoundary;
    scope: string;
  } | null>(null);
  const revision = useRef(0);
  const { subsetId, subsetScope } = boundary;

  // This effect invalidates pending metadata reads on unmount and StrictMode cleanup.
  useEffect(
    () => () => {
      revision.current++;
      previous.current = null;
      transitioning.current = null;
    },
    [],
  );

  // This effect reconciles URL navigation, saved preferences, and scope commands.
  useEffect(() => {
    if (!enabled) {
      revision.current++;
      previous.current = null;
      transitioning.current = null;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const fromUrl: Scope = params.get("subset")
      ? {
          subsetId: params.get("subset")!,
          subsetScope:
            params.get("subsetScope") === "segments" ? "segments" : "episodes",
        }
      : {};
    const current = { subsetId, subsetScope };
    const next: SyncedScope = {
      datasetId,
      domainId,
      pathname: window.location.pathname,
      scope: scopeKey(current),
      url: scopeKey(fromUrl),
      boundary,
    };
    const last = previous.current;
    const transition = transitioning.current;
    if (transition) {
      // Publishing a conversion waits for the server. Until it arrives, the
      // outgoing domain still renders its old boundary; do not save that as
      // a user scope change or erase the destination from the URL.
      if (
        transition.datasetId === datasetId &&
        transition.from === domainId &&
        transition.boundary === boundary &&
        transition.scope === next.url
      )
        return;
      transitioning.current = null;
    }
    // A router can update the address before the next dataset has loaded.
    if (
      last &&
      last.datasetId === datasetId &&
      last.pathname !== next.pathname
    ) {
      revision.current++;
      return;
    }
    const entering = !last || last.datasetId !== datasetId;
    const navigating = !entering && last.url !== next.url;
    previous.current = next;

    if (entering || navigating) {
      const remembered = entering ? readPreference(datasetId) : {};
      const desired = entering && !params.has("subset") ? remembered : fromUrl;
      const restoring = entering && scopeKey(remembered) === scopeKey(desired);
      const request = ++revision.current;
      if (scopeKey(desired) === next.scope) {
        previous.current = { ...next, url: scopeKey(desired) };
        persist(datasetId, desired);
        return;
      }
      const apply = (
        view?: Parameters<typeof openSubset>[2],
        preferredGroupSlice?: string | null,
      ) => {
        if (revision.current !== request) return;
        const targetDomain =
          view === undefined
            ? domainId
            : selectionDomainId(
                datasetId,
                viewConversion(view ?? [])?.key ?? null,
              );
        previous.current = {
          ...next,
          domainId: targetDomain,
          scope: scopeKey(desired),
          url: scopeKey(desired),
        };
        if (targetDomain !== domainId) {
          transitioning.current = {
            datasetId,
            from: domainId,
            boundary,
            scope: scopeKey(desired),
          };
        }
        persist(datasetId, desired);
        // Reloading the same scope must retain its session-stored captures.
        // Actual scope navigation still goes through the command that clears them.
        if (restoring && targetDomain === domainId) setBoundary(desired);
        else
          openSubset(
            desired.subsetId,
            desired.subsetScope,
            view,
            preferredGroupSlice,
          );
      };
      if (desired.subsetId) {
        // Converted subsets carry the view needed to reopen their members.
        // Missing subsets retain the existing "Unavailable subset" UI.
        void getSubset(datasetId, desired.subsetId).then(
          (subset) => apply(subset.view ?? null, subset.preferredGroupSlice),
          () => apply(),
        );
      } else apply();
    } else if (last.boundary !== boundary || last.domainId !== domainId) {
      revision.current++;
      previous.current = { ...next, url: next.scope };
      persist(datasetId, current);
    }
  }, [
    datasetId,
    domainId,
    enabled,
    boundary,
    subsetId,
    subsetScope,
    search,
    openSubset,
    setBoundary,
  ]);
}
