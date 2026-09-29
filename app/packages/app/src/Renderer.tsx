/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Queries } from "./makeRoutes";
import type { Entry } from "./routing";

import { Pending } from "@fiftyone/components";
import { subscribe } from "@fiftyone/relay";
import {
  isModalActive,
  activeSchemaLensKey,
  activeSchemaWireExclusions,
  theme,
  themeConfig,
  useSetExpandedSample,
  useSetModalState,
  useViewChangePending,
  viewChangePending,
} from "@fiftyone/state";
import { useColorScheme } from "@mui/material";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  atom,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { useRouterContext } from "./routing";
import { resolveURL } from "./utils";
import Pixelating from "./Pixelating";

export const pendingEntry = atom<boolean>({
  key: "pendingEntry",
  default: false,
});

export const entry = atom<Entry<Queries> | null>({
  key: "Entry",
  default: null,
  dangerouslyAllowMutability: true,
});

const ColorScheme = () => {
  const { setMode } = useColorScheme();
  const current = useRecoilValue(themeConfig);
  const setTheme = useSetRecoilState(theme);
  useLayoutEffect(() => {
    if (current !== "browser") {
      setTheme(current);
      setMode(current);
    }
  }, [current, setMode, setTheme]);

  return null;
};

/**
 * Syncs the active schema-policy exclusions (workflow task policy +
 * the admin Explore schema lens) into the
 * router's location state, reloading the page query with a silent
 * `ExcludeFields` in `$extendedView` (see `makeRoutes`). The server
 * then serializes the dataset schema, sample payloads, and counts
 * WITHOUT the hidden fields — the same mechanism Field Visibility
 * uses, on a parallel channel so it survives view changes and renders
 * no view-bar chip. The client-side `fieldSchema`/`labelFields`
 * filtering stays as the instant-apply layer while this reload is in
 * flight.
 */
const TaskSchemaExclusions = () => {
  const router = useRouterContext();
  const exclusions = useRecoilValue(activeSchemaWireExclusions);
  const lensKey = useRecoilValue(activeSchemaLensKey);

  useEffect(() => {
    const state = router.get().state;
    const current = state.schemaExclusion ?? [];
    const next = [...(exclusions ?? [])].sort();
    const sameExclusions =
      current.length === next.length &&
      current.every((path, i) => path === next[i]);
    // Keyed on schema IDENTITY too: switching schemas always refetches,
    // even between schemas that hide the same fields.
    if (sameExclusions && (state.schemaKey ?? "") === lensKey) {
      return;
    }
    router.history.replace(
      resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
      }),
      {
        ...state,
        // A non-"modal" event makes the router treat this as a HARD
        // load (network-only, no entry reuse) — the same trick the
        // Field Visibility setter uses; without it, modal-tagged
        // states reuse the current page and skip the reload entirely.
        event: "schemaExclusion",
        schemaExclusion: next.length ? next : undefined,
        schemaKey: lensKey || undefined,
      },
    );
  }, [exclusions, lensKey, router]);

  return null;
};

const Renderer = () => {
  const routeEntry = useRecoilValue(entry);

  const [pending, setPending] = useRecoilState(pendingEntry);
  const viewPending = useViewChangePending();
  const router = useRouterContext();
  const [ready, setReady] = useState(false);
  const setModalState = useSetModalState();
  const setExpansion = useSetExpandedSample();

  const apply = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (result: Entry<Queries>) => {
        set(entry, result);
        setReady(true);
      },
    [router],
  );

  const init = useCallback(
    async (result: Entry<Queries>) => {
      await setModalState();
      await setExpansion();
      apply(result);
    },
    [apply, setExpansion, setModalState],
  );

  useEffect(() => {
    router.load().then(init);
    subscribe((_, { set }) => {
      set(entry, router.get(true));
      set(pendingEntry, false);
      // An operator-driven view change lands here too; its pending
      // treatment ends with the entry that carries it
      set(viewChangePending, false);
    });
  }, [init, router]);

  useEffect(() => {
    return router.subscribe(
      () => undefined,
      () => setPending(true),
    );
  }, [router, setPending]);

  const loading = <Pixelating />;
  if (!routeEntry || !ready) return loading;

  return (
    <Suspense fallback={loading}>
      <ColorScheme key={"color-scheme"} />
      <Modal key={"modal"} />
      <TaskSchemaExclusions key={"task-schema-exclusions"} />
      <Route key={"route"} route={routeEntry} />
      {(pending || viewPending) && <Pending key={"pending"} />}
    </Suspense>
  );
};

const Modal = () => {
  const active = Boolean(useRecoilValue(isModalActive));
  useEffect(() => {
    document.getElementById("modal")?.classList.toggle("modalon", active);
  }, [active]);

  return null;
};
const Route = ({ route }: { route: Entry<Queries> }) => {
  const Component = route.component;

  useEffect(() => {
    route &&
      document.dispatchEvent(new CustomEvent("page-change", { bubbles: true }));
  }, [route]);

  return <Component prepared={route.preloadedQuery} />;
};

export default Renderer;
