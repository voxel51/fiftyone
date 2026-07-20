import type {
  AdapterDescriptor,
  FormatAdapter,
  SampleDescriptor,
} from "../ports";

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
): Promise<AdapterDescriptor | null> {
  for (const descriptor of descriptors.values()) {
    if (await descriptor.detect(sample)) return descriptor;
  }
  return null;
}

/** Detects and lazily loads the format adapter for one sample. */
export async function loadFormatAdapter(
  sample: SampleDescriptor,
): Promise<FormatAdapter | null> {
  const descriptor = await findFormatAdapterDescriptor(sample);
  return descriptor ? descriptor.load() : null;
}

/** Clears registration state between isolated registry tests. */
export function resetFormatAdapterRegistryForTests(): void {
  descriptors.clear();
}
