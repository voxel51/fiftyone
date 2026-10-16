import type {
  AdapterDescriptor,
  EpisodeOpenOptions,
  FormatAdapter,
  SampleDescriptor,
} from "../ports";
import { createAbortError, throwIfAborted } from "../utils/cancellation";

const descriptors = new Map<string, AdapterDescriptor>();
const adapterLoads = new Map<AdapterDescriptor, Promise<FormatAdapter>>();

/** Registers one build-time format adapter descriptor. */
export function registerFormatAdapter(
  descriptor: AdapterDescriptor,
): () => void {
  const previous = descriptors.get(descriptor.id);
  if (previous) adapterLoads.delete(previous);
  descriptors.set(descriptor.id, descriptor);
  return () => {
    if (descriptors.get(descriptor.id) === descriptor) {
      descriptors.delete(descriptor.id);
      adapterLoads.delete(descriptor);
    }
  };
}

/** Returns the currently registered lightweight adapter descriptors. */
export function getFormatAdapterDescriptors(): readonly AdapterDescriptor[] {
  return [...descriptors.values()];
}

/** Finds the first descriptor that recognizes the supplied sample facts. */
export async function findFormatAdapterDescriptor(
  sample: SampleDescriptor,
  options?: EpisodeOpenOptions,
): Promise<AdapterDescriptor | null> {
  for (const descriptor of descriptors.values()) {
    throwIfAborted(options?.signal);
    if (await descriptor.detect(sample, options)) {
      throwIfAborted(options?.signal);
      return descriptor;
    }
  }
  throwIfAborted(options?.signal);
  return null;
}

/** Detects and lazily loads the format adapter for one sample. */
export async function loadFormatAdapter(
  sample: SampleDescriptor,
  options?: EpisodeOpenOptions,
): Promise<FormatAdapter | null> {
  const descriptor = await findFormatAdapterDescriptor(sample, options);
  if (!descriptor) return null;
  // Loading code is shared across previews and modal opens. A departing
  // sample may cancel its own open, but must not cancel another consumer's
  // module load (including the view extensions composed by registration).
  let loading = adapterLoads.get(descriptor);
  if (!loading) {
    loading = Promise.resolve()
      .then(() => descriptor.load())
      .catch((error: unknown) => {
        if (adapterLoads.get(descriptor) === loading) {
          adapterLoads.delete(descriptor);
        }
        throw error;
      });
    adapterLoads.set(descriptor, loading);
  }
  const signal = options?.signal;
  if (!signal) return loading;
  const sharedLoad = loading;
  const adapter = await new Promise<FormatAdapter>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    sharedLoad.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  throwIfAborted(signal);
  return adapter;
}

/** Clears registration state between isolated registry tests. */
export function resetFormatAdapterRegistryForTests(): void {
  descriptors.clear();
  adapterLoads.clear();
}
