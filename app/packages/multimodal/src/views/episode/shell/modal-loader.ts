import type { AdapterDescriptor, SampleDescriptor } from "../../../ports";
import {
  findFormatAdapterDescriptor,
  loadFormatAdapter,
} from "../../../runtime/adapter-registry";

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
export function preloadEpisodeModal(sample: SampleDescriptor): void {
  void loadEpisodeModal().catch(() => undefined);
  void loadFormatAdapter(sample).catch(() => undefined);
}

const idlePreloads = new WeakSet<AdapterDescriptor>();

/** Uses idle time after a grid poster is available, once per registered format. */
export function scheduleEpisodeModalPreload(sample: SampleDescriptor): void {
  void findFormatAdapterDescriptor(sample)
    .then((descriptor) => {
      if (!descriptor || idlePreloads.has(descriptor)) return;
      idlePreloads.add(descriptor);
      const preload = () => preloadEpisodeModal(sample);
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(preload, { timeout: 1_000 });
      } else {
        window.setTimeout(preload, 0);
      }
    })
    .catch(() => undefined);
}
