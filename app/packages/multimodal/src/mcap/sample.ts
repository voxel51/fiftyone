import type { SampleRendererProps } from "@fiftyone/plugins";

type SampleContext = SampleRendererProps["ctx"];

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value) {
    return value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return null;
}

/**
 * Extracts the dataset and sample identifiers.
 */
export function getSampleIdentifiers(ctx: SampleContext): {
  readonly datasetId: string | null;
  readonly sampleId: string | null;
} {
  const sampleRecord = ctx.sample.sample as {
    readonly _id?: unknown;
    readonly id?: unknown;
  };

  return {
    datasetId: normalizeIdentifier(ctx.dataset.datasetId),
    sampleId:
      normalizeIdentifier(sampleRecord._id) ??
      normalizeIdentifier(sampleRecord.id),
  };
}
