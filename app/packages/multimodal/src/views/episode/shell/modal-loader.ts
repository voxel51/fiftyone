let modalModule: Promise<typeof import("./ModalRenderer")> | null = null;

/** Shares speculative and on-demand module loading, retrying failed preloads. */
export function loadEpisodeModal() {
  modalModule ??= import("./ModalRenderer").catch((error: unknown) => {
    modalModule = null;
    throw error;
  });
  return modalModule;
}

/** Starts code loading without opening or taking ownership of an episode. */
export function preloadEpisodeModal(): void {
  void loadEpisodeModal().catch(() => undefined);
}

let idlePreloadScheduled = false;

/** Uses idle time after a grid poster is available; schedules once per document. */
export function scheduleEpisodeModalPreload(): void {
  if (idlePreloadScheduled || modalModule) return;
  idlePreloadScheduled = true;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(preloadEpisodeModal, { timeout: 1_000 });
  } else {
    window.setTimeout(preloadEpisodeModal, 0);
  }
}
