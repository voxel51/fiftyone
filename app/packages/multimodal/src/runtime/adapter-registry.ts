import type {
  AdapterDescriptor,
  EpisodeOpenOptions,
  FormatAdapter,
  SampleDescriptor,
} from "../ports";
import { throwIfAborted } from "../utils/cancellation";

const descriptors = new Map<string, AdapterDescriptor>();

/** Registers one build-time format adapter descriptor. */
export function registerFormatAdapter(
  descriptor: AdapterDescriptor,
): () => void {
  descriptors.set(descriptor.id, descriptor);
  return () => {
    if (descriptors.get(descriptor.id) === descriptor) {
      descriptors.delete(descriptor.id);
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
  const adapter = await descriptor.load(options);
  throwIfAborted(options?.signal);
  return adapter;
}

/** Clears registration state between isolated registry tests. */
export function resetFormatAdapterRegistryForTests(): void {
  descriptors.clear();
}
