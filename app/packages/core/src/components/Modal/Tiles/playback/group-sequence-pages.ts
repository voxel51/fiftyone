import type {
  DecodedOutput,
  IndexedSequencePage,
} from "@fiftyone/multimodal/sequence";
import { VISUALIZATION_KIND } from "@fiftyone/multimodal/sequence";
import * as foq from "@fiftyone/relay";
import { getNormalizedUrls, getSampleSrc } from "@fiftyone/state";
import type { State } from "@fiftyone/state";
import { fetchQuery, type Environment } from "relay-runtime";
import { labelFieldAnnotations, type LabelColoring } from "./label-annotations";

/** One image stream: a group slice, or the samples of a flat dynamic group. */
export interface PlaybackSlice {
  /** `null` for a dynamic group over a dataset without group slices. */
  readonly name: string | null;
  readonly streamId: string;
  readonly labelStreams: readonly {
    readonly field: string;
    readonly streamId: string;
  }[];
}

export interface GroupSequencePagesConfig {
  readonly coloring: LabelColoring;
  readonly dataset: string;
  readonly dynamicGroup: string;
  readonly environment: Environment;
  /** Group field of a grouped dataset, used to join slices on group id. */
  readonly groupField: string | null;
  /** Slice the grid was browsing; scopes the dynamic group like the paginator. */
  readonly gridSlice: string | null;
  readonly mediaField: string;
  /**
   * Slice that defines the element order. Element `i` is the `i`-th sample
   * of this slice, exactly as the paginator counts.
   */
  readonly referenceSlice: PlaybackSlice;
  readonly otherSlices: readonly PlaybackSlice[];
  readonly view: State.Stage[];
}

/**
 * How far around a page the other slices are fetched. Positions only line
 * up across slices when every group has every slice; the margin absorbs a
 * few missing samples before a join starts coming up empty.
 */
const JOIN_MARGIN = 8;
const MEDIA_CONCURRENCY = 6;

type Edge = {
  readonly cursor: string;
  readonly node: {
    readonly __typename: string;
    readonly sample?: unknown;
    readonly urls?: readonly { readonly field: string; readonly url: string }[];
  };
};

type SampleDoc = Record<string, unknown> & {
  readonly metadata?: {
    readonly width?: number;
    readonly height?: number;
  } | null;
};

/**
 * Loads `count` elements of an ordered dynamic group from `startIndex`: one
 * paginated query per slice, joined on group id, then each element's media
 * bytes and labels.
 */
export function createGroupSequencePageLoader(
  config: GroupSequencePagesConfig,
) {
  return async (
    startIndex: number,
    count: number,
    signal: AbortSignal,
  ): Promise<IndexedSequencePage> => {
    if (count <= 0) return [];
    const otherStart = Math.max(0, startIndex - JOIN_MARGIN);
    const [referenceEdges, ...otherEdges] = await Promise.all([
      fetchEdges(config, config.referenceSlice.name, startIndex, count, signal),
      ...config.otherSlices.map((slice) =>
        fetchEdges(
          config,
          slice.name,
          otherStart,
          count + (startIndex - otherStart) + JOIN_MARGIN,
          signal,
        ),
      ),
    ]);

    const othersByGroup = config.otherSlices.map((slice, index) => ({
      slice,
      byGroup: new Map(
        otherEdges[index].flatMap((edge) => {
          const group = groupIdOf(edge, config.groupField);
          return group ? [[group, edge] as const] : [];
        }),
      ),
    }));

    // One media job per (element, slice) that has a sample. A slice with no
    // sample in an element's group contributes nothing to that element.
    const jobs: Array<{ element: number; slice: PlaybackSlice; edge: Edge }> =
      [];
    referenceEdges.forEach((edge, element) => {
      jobs.push({ element, slice: config.referenceSlice, edge });
      const group = groupIdOf(edge, config.groupField);
      if (!group) return;
      for (const { slice, byGroup } of othersByGroup) {
        const match = byGroup.get(group);
        if (match) jobs.push({ element, slice, edge: match });
      }
    });

    const elements = referenceEdges.map(() => new Map<string, DecodedOutput>());
    await runLimited(
      jobs.map(({ element, slice, edge }) => async () => {
        for (const [streamId, output] of await decodeElement(
          config,
          slice,
          edge,
          signal,
        )) {
          elements[element].set(streamId, output);
        }
      }),
      MEDIA_CONCURRENCY,
      signal,
    );
    return elements;
  };
}

async function fetchEdges(
  config: GroupSequencePagesConfig,
  slice: string | null,
  startIndex: number,
  count: number,
  signal: AbortSignal,
): Promise<readonly Edge[]> {
  const filter =
    slice === null
      ? {}
      : { group: { slice: config.gridSlice ?? slice, slices: [slice] } };
  // The relay BSON scalar is typed `object`, but a dynamic group key is any
  // BSON value, usually a string, and the server takes it as such.
  const dynamicGroup = config.dynamicGroup as unknown as object;
  const observable = fetchQuery<foq.paginateSamplesQuery>(
    config.environment,
    foq.paginateSamples,
    {
      // `after` is the cursor before the first wanted element
      after: startIndex > 0 ? String(startIndex - 1) : null,
      count,
      dataset: config.dataset,
      dynamicGroup,
      filter,
      view: config.view,
    },
    { fetchPolicy: "network-only" },
  );
  const data = await new Promise<foq.paginateSamplesQuery["response"]>(
    (resolve, reject) => {
      const subscription = observable.subscribe({
        next: resolve,
        error: reject,
      });
      signal.addEventListener("abort", () => {
        subscription.unsubscribe();
        reject(signal.reason);
      });
    },
  );
  const samples = data.samples;
  if (samples.__typename !== "SampleItemStrConnection") {
    throw new Error("Timed out loading group elements");
  }
  return samples.edges as readonly Edge[];
}

function groupIdOf(edge: Edge, groupField: string | null): string | null {
  if (!groupField) return null;
  const sample = edge.node.sample as SampleDoc | undefined;
  const group = sample?.[groupField] as { _id?: string } | undefined;
  return group?._id ?? null;
}

async function decodeElement(
  config: GroupSequencePagesConfig,
  slice: PlaybackSlice,
  edge: Edge,
  signal: AbortSignal,
): Promise<readonly [string, DecodedOutput][]> {
  if (edge.node.__typename !== "ImageSample" || !edge.node.urls) return [];
  const sample = (edge.node.sample ?? {}) as SampleDoc;
  const urls = getNormalizedUrls(edge.node.urls);
  const url = urls[config.mediaField] ?? urls.filepath;
  if (!url) return [];

  const response = await fetch(getSampleSrc(url), { signal });
  if (!response.ok) return [];
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const entries: [string, DecodedOutput][] = [
    [
      slice.streamId,
      {
        resourceHints: { sizeBytes: bytes.byteLength },
        visualization: {
          bytes,
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
          mimeType: blob.type || undefined,
        },
      },
    ],
  ];

  if (slice.labelStreams.length === 0) return entries;
  const size = await imageSize(sample, blob);
  if (!size) return entries;
  for (const { field, streamId } of slice.labelStreams) {
    const visualization = labelFieldAnnotations(
      sample[field],
      field,
      size.width,
      size.height,
      config.coloring,
    );
    if (visualization) entries.push([streamId, { visualization }]);
  }
  return entries;
}

/**
 * Pixel size for converting relative label coordinates. Uses stored
 * metadata when present; otherwise decodes the image once to measure it.
 */
async function imageSize(
  sample: SampleDoc,
  blob: Blob,
): Promise<{ width: number; height: number } | null> {
  const width = sample.metadata?.width;
  const height = sample.metadata?.height;
  if (width && height) return { width, height };
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

async function runLimited(
  jobs: readonly (() => Promise<void>)[],
  limit: number,
  signal: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      if (signal.aborted) throw signal.reason;
      const index = next;
      next += 1;
      await jobs[index]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, worker),
  );
}
