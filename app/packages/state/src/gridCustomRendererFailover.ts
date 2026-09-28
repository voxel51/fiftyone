/**
 * @fileoverview
 *
 * If a custom grid renderer throws, we mark that dataset as fail-open, reload
 * onto a fresh synced subscription, and then keep that dataset on the built-in
 * grid renderer. The mark lasts until the next page load, so reloading retries
 * the renderer rather than stranding the user on the built-in one.
 *
 * Implementation-wise, this is a tiny external store backed by
 * `sessionStorage`: it tracks failed datasets locally, exposes a forced
 * subscription for the reload path, and uses `useSyncExternalStore` for React
 * reactivity. We do not use Recoil here because state subscription needs to
 * read the forced subscription synchronously outside normal React rendering.
 */
import { useSyncExternalStore } from "react";

export type GridCustomRendererFailure = {
  datasetName: string;
  rendererName: string;
  failedAt: number;
  errorMessage?: string;
  // Set once the reload this failure triggered has landed. Reloading is the
  // user's way of saying "try again", so a failure only survives the one
  // reload it caused.
  consumed?: boolean;
};

type GridCustomRendererFailoverSnapshot = {
  // Per-dataset UI state for the warning banner. Dismissing a banner should
  // not clear fail-open mode, so this is tracked separately from `failures`.
  dismissedBanners: Record<string, boolean>;
  // Per-dataset fail-open decisions. If a dataset is present here, its custom
  // grid renderer stays disabled until the next page load.
  failures: Record<string, GridCustomRendererFailure>;
};

type MarkGridCustomRendererFailedOptions = {
  datasetName: string | null | undefined;
  rendererName: string;
  errorMessage?: string;
};

const STORAGE_KEY = "grid-custom-renderer-failover";

const createEmptySnapshot = (): GridCustomRendererFailoverSnapshot => ({
  dismissedBanners: {},
  failures: {},
});

const canUseSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const isFailure = (value: unknown): value is GridCustomRendererFailure => {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as GridCustomRendererFailure).datasetName === "string" &&
    typeof (value as GridCustomRendererFailure).rendererName === "string" &&
    typeof (value as GridCustomRendererFailure).failedAt === "number",
  );
};

const parseFailures = (
  value: unknown,
): Record<string, GridCustomRendererFailure> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<
    Record<string, GridCustomRendererFailure>
  >((acc, [datasetName, failure]) => {
    if (isFailure(failure) && failure.datasetName === datasetName) {
      acc[datasetName] = failure;
    }

    return acc;
  }, {});
};

const parseDismissedBanners = (value: unknown): Record<string, boolean> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, boolean>>(
    (acc, [datasetName, dismissed]) => {
      if (typeof dismissed === "boolean") {
        acc[datasetName] = dismissed;
      }

      return acc;
    },
    {},
  );
};

const migrateLegacySnapshot = (value: Record<string, unknown>) => {
  const failure = isFailure(value.failure) ? value.failure : null;

  if (!failure) {
    return createEmptySnapshot();
  }

  return {
    dismissedBanners: {
      [failure.datasetName]: value.dismissedBanner === true,
    },
    failures: {
      [failure.datasetName]: failure,
    },
  };
};

const getLatestFailure = (
  failures: Record<string, GridCustomRendererFailure>,
): GridCustomRendererFailure | null => {
  let latestFailure: GridCustomRendererFailure | null = null;

  for (const failure of Object.values(failures)) {
    if (!latestFailure || failure.failedAt > latestFailure.failedAt) {
      latestFailure = failure;
    }
  }

  return latestFailure;
};

const getForcedSubscription = (
  failures: Record<string, GridCustomRendererFailure>,
) => {
  const latestFailure = getLatestFailure(failures);

  return latestFailure ? `failopen-${latestFailure.failedAt}` : null;
};

/**
 * Reads the current persisted shape. The previous session-wide shape is still
 * accepted so an existing tab can seamlessly upgrade to the dataset-scoped
 * model without manual storage clearing.
 */
const readStoredSnapshot = (): GridCustomRendererFailoverSnapshot => {
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

    if ("failures" in value || "dismissedBanners" in value) {
      return {
        dismissedBanners: parseDismissedBanners(
          (value as { dismissedBanners?: unknown }).dismissedBanners,
        ),
        failures: parseFailures((value as { failures?: unknown }).failures),
      };
    }

    return migrateLegacySnapshot(value as Record<string, unknown>);
  } catch {
    return createEmptySnapshot();
  }
};

/**
 * Drops failures that already served their reload, so the renderer is retried
 * rather than left disabled with no way back: `sessionStorage` outlives a hard
 * refresh, and Chrome restores it on tab restore, so a kept failure survives
 * even quitting the browser and only a brand new tab clears it.
 */
const dropSpentFailures = (
  stored: GridCustomRendererFailoverSnapshot,
): GridCustomRendererFailoverSnapshot => {
  const failures: Record<string, GridCustomRendererFailure> = {};
  const dismissedBanners: Record<string, boolean> = {};

  for (const [datasetName, failure] of Object.entries(stored.failures)) {
    if (failure.consumed) {
      continue;
    }

    failures[datasetName] = failure;
    if (stored.dismissedBanners[datasetName]) {
      dismissedBanners[datasetName] = true;
    }
  }

  return { dismissedBanners, failures };
};

const readSnapshot = (): GridCustomRendererFailoverSnapshot =>
  dropSpentFailures(readStoredSnapshot());

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

const getFailure = (
  datasetName: string | null | undefined,
  currentSnapshot: GridCustomRendererFailoverSnapshot = snapshot,
) => {
  if (!datasetName) {
    return null;
  }

  return currentSnapshot.failures[datasetName] ?? null;
};

const isBannerDismissed = (
  datasetName: string | null | undefined,
  currentSnapshot: GridCustomRendererFailoverSnapshot = snapshot,
) => {
  if (!datasetName) {
    return false;
  }

  return currentSnapshot.dismissedBanners[datasetName] === true;
};

/** Subscribes React to this external fail-open store. */
export const subscribeToGridCustomRendererFailover = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/** Returns the current fail-open snapshot for this browser session. */
export const getGridCustomRendererFailoverSnapshot = () => snapshot;

/**
 * Returns the replacement synced subscription used after a renderer crash. The
 * disable state is dataset-scoped, but subscription repair still happens at
 * the tab level because the poisoned sync channel is shared by the whole app.
 */
export const getGridCustomRendererFailoverForcedSubscription = () =>
  getForcedSubscription(snapshot.failures);

/**
 * Records that the reload these failures triggered has landed. They stay in
 * force for this page load; the next one drops them and retries the renderer.
 */
export const consumeGridCustomRendererFailover = () => {
  const entries = Object.entries(snapshot.failures);
  if (
    entries.length === 0 ||
    entries.every(([, failure]) => failure.consumed)
  ) {
    return;
  }

  replaceSnapshot({
    dismissedBanners: snapshot.dismissedBanners,
    failures: Object.fromEntries(
      entries.map(([datasetName, failure]) => [
        datasetName,
        { ...failure, consumed: true },
      ]),
    ),
  });
};

/** Returns the recorded failure for a dataset in the current browser session. */
export const getGridCustomRendererFailover = (
  datasetName: string | null | undefined,
) => getFailure(datasetName);

/** Whether custom grid renderers are disabled for the given dataset. */
export const isGridCustomRendererFailOpen = (
  datasetName: string | null | undefined,
) => Boolean(getFailure(datasetName));

/**
 * Records the first renderer failure for a dataset in the current browser
 * session.
 *
 * Repeated failures on the same dataset are ignored, but a later first failure
 * on a different dataset will mint a fresh forced subscription so the app can
 * reload away from any newly poisoned sync channel.
 */
export const markGridCustomRendererFailed = ({
  datasetName,
  rendererName,
  errorMessage,
}: MarkGridCustomRendererFailedOptions) => {
  if (!datasetName) {
    return null;
  }

  const existingFailure = getFailure(datasetName);

  if (existingFailure) {
    return existingFailure;
  }

  const latestFailure = getLatestFailure(snapshot.failures);
  const failedAt = Math.max(
    Date.now(),
    latestFailure ? latestFailure.failedAt + 1 : 0,
  );

  const failure = {
    datasetName,
    rendererName,
    failedAt,
    ...(errorMessage ? { errorMessage } : {}),
  };

  replaceSnapshot({
    dismissedBanners: {
      ...snapshot.dismissedBanners,
      [datasetName]: false,
    },
    failures: {
      ...snapshot.failures,
      [datasetName]: failure,
    },
  });

  return failure;
};

/**
 * Hides the warning banner for a dataset without clearing fail-open mode.
 * Dismissing the banner is purely a UI choice and should not re-enable the
 * crashing renderer for that dataset.
 */
export const dismissGridCustomRendererFailoverBanner = (
  datasetName: string | null | undefined,
) => {
  if (!datasetName || isBannerDismissed(datasetName)) {
    return;
  }

  replaceSnapshot({
    ...snapshot,
    dismissedBanners: {
      ...snapshot.dismissedBanners,
      [datasetName]: true,
    },
  });
};

/**
 * React view onto the external fail-open store.
 *
 * `useSyncExternalStore` bridges React to this module-level source of truth,
 * while selectors and other non-React code can still read it synchronously.
 *
 * When a dataset name is provided, the disable/banner state is scoped to that
 * dataset. The forced subscription remains shared because the sync repair path
 * still applies to the entire tab.
 */
export const useGridCustomRendererFailover = (datasetName?: string | null) => {
  const currentSnapshot = useSyncExternalStore(
    subscribeToGridCustomRendererFailover,
    getGridCustomRendererFailoverSnapshot,
    createEmptySnapshot,
  );

  const failure = getFailure(datasetName, currentSnapshot);

  return {
    dismissBanner: () =>
      dismissGridCustomRendererFailoverBanner(datasetName ?? null),
    failure,
    forcedSubscription: getForcedSubscription(currentSnapshot.failures),
    hasAnyFailures: Object.keys(currentSnapshot.failures).length > 0,
    isBannerVisible:
      Boolean(failure) && !isBannerDismissed(datasetName, currentSnapshot),
    isDisabled: Boolean(failure),
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
