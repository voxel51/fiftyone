import { useSyncExternalStore } from "react";

/**
 * Session-scoped fail-open metadata for the first custom grid renderer crash.
 *
 * Why this exists:
 * a thrown custom grid renderer can poison the app's current backend-synced
 * subscription. Once that happens, normal dataset navigation can drift out of
 * sync, with the URL, dataset selector, sidebar, and grid content disagreeing
 * about which dataset is actually active.
 *
 * The mitigation is intentionally session-wide:
 * - record the first renderer failure in this browser tab
 * - disable all custom grid renderers for the rest of the session
 * - force the app onto a fresh synced subscription
 * - persist that decision in sessionStorage so the one-time reload preserves it
 *
 * This store lives outside Recoil on purpose. React components need to
 * subscribe to it, but the forced subscription must also be readable
 * synchronously from `stateSubscription` during selector evaluation.
 */
export type GridCustomRendererFailure = {
  datasetName: string;
  rendererName: string;
  failedAt: number;
  errorMessage?: string;
};

type GridCustomRendererFailoverSnapshot = {
  dismissedBanner: boolean;
  failure: GridCustomRendererFailure | null;
};

type MarkGridCustomRendererFailedOptions = {
  datasetName: string | null | undefined;
  rendererName: string;
  errorMessage?: string;
};

const STORAGE_KEY = "grid-custom-renderer-failover";

const createEmptySnapshot = (): GridCustomRendererFailoverSnapshot => ({
  dismissedBanner: false,
  failure: null,
});

const getForcedSubscription = (failure: GridCustomRendererFailure | null) => {
  return failure ? `failopen-${failure.failedAt}` : null;
};

const canUseSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

/**
 * Reads the current persisted shape. Older auxiliary fields are ignored so the
 * store stays small and the forced subscription can be derived from `failure`.
 */
const readSnapshot = (): GridCustomRendererFailoverSnapshot => {
  if (!canUseSessionStorage()) {
    return createEmptySnapshot();
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);

    if (!raw || raw === "undefined") {
      return createEmptySnapshot();
    }

    const value = JSON.parse(raw);

    if (!value || typeof value !== "object") {
      return createEmptySnapshot();
    }

    const failure =
      "failure" in value &&
      value.failure &&
      typeof value.failure === "object" &&
      typeof (value.failure as GridCustomRendererFailure).datasetName ===
        "string" &&
      typeof (value.failure as GridCustomRendererFailure).rendererName ===
        "string" &&
      typeof (value.failure as GridCustomRendererFailure).failedAt === "number"
        ? (value.failure as GridCustomRendererFailure)
        : null;

    return {
      dismissedBanner:
        "dismissedBanner" in value && typeof value.dismissedBanner === "boolean"
          ? value.dismissedBanner
          : false,
      failure,
    };
  } catch {
    return createEmptySnapshot();
  }
};

let snapshot = readSnapshot();
const listeners = new Set<() => void>();

const replaceSnapshot = (nextSnapshot: GridCustomRendererFailoverSnapshot) => {
  snapshot = nextSnapshot;

  if (canUseSessionStorage()) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSnapshot));
    } catch {
      // Ignore storage failures and keep the in-memory snapshot.
    }
  }

  listeners.forEach((listener) => listener());
};

/** Subscribes React to this external fail-open store. */
export const subscribeToGridCustomRendererFailover = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/** Returns the current session fail-open snapshot. */
export const getGridCustomRendererFailoverSnapshot = () => snapshot;

/**
 * Returns the replacement synced subscription used after fail-open. It is
 * derived from the recorded failure so the persisted store only needs one piece
 * of state to describe the session decision.
 */
export const getGridCustomRendererFailoverForcedSubscription = () =>
  getForcedSubscription(snapshot.failure);

/** Returns the recorded fail-open decision for the current browser session. */
export const getGridCustomRendererFailover = () => snapshot.failure;

/** Whether custom grid renderers are disabled for the current browser session. */
export const isGridCustomRendererFailOpen = () =>
  Boolean(getGridCustomRendererFailover());

/**
 * Records the first renderer failure for the current browser session.
 *
 * Later failures are ignored so the tab keeps one stable fail-open decision
 * and one stable forced subscription for the rest of its lifetime.
 */
export const markGridCustomRendererFailed = ({
  datasetName,
  rendererName,
  errorMessage,
}: MarkGridCustomRendererFailedOptions) => {
  if (!datasetName) {
    return null;
  }

  if (snapshot.failure) {
    return snapshot.failure;
  }

  const failure = {
    datasetName,
    rendererName,
    failedAt: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  };

  replaceSnapshot({
    dismissedBanner: false,
    failure,
  });

  return failure;
};

/**
 * Hides the warning banner without clearing fail-open mode. Dismissing the
 * banner is purely a UI choice and should not re-enable crashing renderers.
 */
export const dismissGridCustomRendererFailoverBanner = () => {
  if (snapshot.dismissedBanner) {
    return;
  }

  replaceSnapshot({
    ...snapshot,
    dismissedBanner: true,
  });
};

/**
 * React view onto the external fail-open store.
 *
 * `useSyncExternalStore` bridges React to this module-level source of truth,
 * while selectors and other non-React code can still read it synchronously.
 */
export const useGridCustomRendererFailover = () => {
  const currentSnapshot = useSyncExternalStore(
    subscribeToGridCustomRendererFailover,
    getGridCustomRendererFailoverSnapshot,
    createEmptySnapshot
  );

  return {
    dismissBanner: dismissGridCustomRendererFailoverBanner,
    failure: currentSnapshot.failure,
    forcedSubscription: getForcedSubscription(currentSnapshot.failure),
    isBannerVisible:
      Boolean(currentSnapshot.failure) && !currentSnapshot.dismissedBanner,
    isDisabled: Boolean(currentSnapshot.failure),
  };
};

/** Test helper that clears all in-memory and session-scoped fail-open state. */
export const __resetGridCustomRendererFailoverForTests = () => {
  snapshot = createEmptySnapshot();

  if (canUseSessionStorage()) {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }

  listeners.forEach((listener) => listener());
};
