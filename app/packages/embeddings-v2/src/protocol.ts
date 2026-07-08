/**
 * Client for the `/embeddings/v2` column protocol.
 *
 * Binary responses share a 16-byte little-endian header
 * (`u32 magic "FOE1" | u16 version | u8 dtype | u8 width | u32 n |
 * u32 flags`) followed by `width` contiguous columns of `n` values in
 * wire order — the brain run's row order, which is the join key for
 * every per-point datum.
 */
import { getFetchFunction } from "@fiftyone/utilities";

export const MAGIC = 0x464f4531; // "FOE1"
export const HEADER_BYTES = 16;

export const DTYPE_F32 = 1;
export const DTYPE_U16 = 2;
export const DTYPE_BITMASK = 3;
export const DTYPE_BYTES12 = 4;

export interface ColumnHeader {
  version: number;
  dtype: number;
  width: number;
  n: number;
  flags: number;
}

export interface VisualizationRun {
  brainKey: string;
  method: string | null;
  dims: number | null;
  patchesField: string | null;
  pointsField: string | null;
  model: string | null;
  timestamp: string | null;
}

export function parseHeader(buffer: ArrayBuffer): ColumnHeader {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error(`Column response too short: ${buffer.byteLength} bytes`);
  }
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new Error(`Bad column magic: 0x${magic.toString(16)}`);
  }
  return {
    version: view.getUint16(4, true),
    dtype: view.getUint8(6),
    width: view.getUint8(7),
    n: view.getUint32(8, true),
    flags: view.getUint32(12, true),
  };
}

export interface Geometry {
  n: number;
  /** One Float32Array per axis, zero-copy views into the response */
  columns: Float32Array[];
}

/** Raw 12-byte ObjectIds in wire order; decode lazily via idAt() */
export type IdColumn = Uint8Array;

export async function fetchRuns(
  datasetName: string,
): Promise<VisualizationRun[]> {
  const response = await getFetchFunction()<
    { datasetName: string },
    { runs: VisualizationRun[] }
  >("POST", "/embeddings/v2/runs", { datasetName });
  return response.runs;
}

export interface RunInfo extends VisualizationRun {
  n: number;
}

/** Also warms the server's results cache — call before column fetches */
export async function fetchRunInfo(
  datasetName: string,
  brainKey: string,
): Promise<RunInfo> {
  return getFetchFunction()<Record<string, unknown>, RunInfo>(
    "POST",
    "/embeddings/v2/run-info",
    { datasetName, brainKey },
  );
}

export interface Slice {
  offset: number;
  limit: number;
}

export async function fetchGeometry(
  datasetName: string,
  brainKey: string,
  slice?: Slice,
): Promise<Geometry> {
  const buffer = await fetchColumn("/embeddings/v2/geometry", {
    datasetName,
    brainKey,
    ...slice,
  });
  const header = parseHeader(buffer);
  if (header.dtype !== DTYPE_F32) {
    throw new Error(`Expected f32 geometry, got dtype ${header.dtype}`);
  }

  const { n, width } = header;
  const columns: Float32Array[] = [];
  for (let i = 0; i < width; i++) {
    columns.push(new Float32Array(buffer, HEADER_BYTES + 4 * n * i, n));
  }
  return { n, columns };
}

export async function fetchIds(
  datasetName: string,
  brainKey: string,
  slice?: Slice,
): Promise<IdColumn> {
  const buffer = await fetchColumn("/embeddings/v2/ids", {
    datasetName,
    brainKey,
    ...slice,
  });
  const header = parseHeader(buffer);
  if (header.dtype !== DTYPE_BYTES12) {
    throw new Error(`Expected id bytes, got dtype ${header.dtype}`);
  }
  return new Uint8Array(buffer, HEADER_BYTES, header.n * 12);
}

// Byte -> two hex chars, precomputed
const HEX: string[] = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, "0"),
);

/**
 * Decodes the id at a wire-order index to its hex string. On-demand by
 * design: the column stays raw bytes and only ids that are actually
 * used (clicked, hovered, listed) ever become strings.
 */
export function idAt(ids: IdColumn, index: number): string {
  const start = index * 12;
  let id = "";
  for (let i = start; i < start + 12; i++) {
    id += HEX[ids[i]];
  }
  return id;
}

export interface ColorMeta {
  style: "categorical" | "continuous";
  classes?: { label: string | number | boolean; count: number }[];
  truncated?: boolean;
  min?: number | null;
  max?: number | null;
}

export type ColorValues =
  | { style: "categorical"; indices: Uint16Array }
  | { style: "continuous"; values: Float32Array };

/** Fields eligible for color-by (via the legacy schema-only endpoint) */
export async function fetchColorByChoices(
  datasetName: string,
  patchesField: string | null,
): Promise<string[]> {
  const response = await getFetchFunction()<
    Record<string, unknown>,
    { fields: string[] }
  >("POST", "/embeddings/color-by-choices", {
    datasetName,
    view: [],
    slices: null,
    patchesField,
  });
  return response.fields;
}

export interface ColorResponse {
  values: ColorValues;
  meta: ColorMeta;
}

/**
 * The color-by column and its legend meta in one response: the header
 * determines the column's extent, and every byte after it is a UTF-8
 * JSON tail. One request, one server-side values aggregation — the
 * split values/meta endpoints this replaces each paid that aggregation.
 */
export async function fetchColor(
  datasetName: string,
  brainKey: string,
  field: string,
): Promise<ColorResponse> {
  const buffer = await fetchColumn("/embeddings/v2/color", {
    datasetName,
    brainKey,
    field,
  });
  const header = parseHeader(buffer);
  const bytesPerValue =
    header.dtype === DTYPE_U16 ? 2 : header.dtype === DTYPE_F32 ? 4 : null;
  if (bytesPerValue === null) {
    throw new Error(`Unexpected color dtype ${header.dtype}`);
  }

  const tailStart = HEADER_BYTES + header.n * bytesPerValue;
  const meta = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, tailStart)),
  ) as ColorMeta;

  const values: ColorValues =
    header.dtype === DTYPE_U16
      ? {
          style: "categorical",
          indices: new Uint16Array(buffer, HEADER_BYTES, header.n),
        }
      : {
          style: "continuous",
          values: new Float32Array(buffer, HEADER_BYTES, header.n),
        };
  return { values, meta };
}

export const FLAG_ALL_VISIBLE = 1;
export const FLAG_ALL_MATCH = 2;

export interface Masks {
  /** Point's sample is in the current view; null = everything visible */
  visible: Uint8Array | null;
  /** Point survives the sidebar filters; null = everything matches */
  match: Uint8Array | null;
}

/**
 * The run's visible/match bitmasks for the current view + filters,
 * unpacked to one byte per point (null when the header's early-out
 * flags say a column is all ones).
 */
export async function fetchMasks(
  datasetName: string,
  brainKey: string,
  view: unknown[],
  filters: unknown,
): Promise<Masks> {
  const buffer = await fetchColumn("/embeddings/v2/masks", {
    datasetName,
    brainKey,
    view,
    filters,
    slices: null,
  });
  const header = parseHeader(buffer);
  if (header.dtype !== DTYPE_BITMASK) {
    throw new Error(`Expected bitmasks, got dtype ${header.dtype}`);
  }

  const { n, flags } = header;
  const nbytes = Math.ceil(n / 8);
  return {
    visible:
      flags & FLAG_ALL_VISIBLE
        ? null
        : unpackBits(new Uint8Array(buffer, HEADER_BYTES, nbytes), n),
    match:
      flags & FLAG_ALL_MATCH
        ? null
        : unpackBits(new Uint8Array(buffer, HEADER_BYTES + nbytes, nbytes), n),
  };
}

/** Little bit-order bitmask -> one 0/1 byte per point */
export function unpackBits(packed: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (packed[i >> 3] >> (i & 7)) & 1;
  }
  return out;
}

export interface LassoStage {
  _cls: string;
  kwargs: Record<string, unknown>;
  count: number | null;
}

/**
 * Resolves a lasso to a serialized view stage. Selections travel as the
 * data-space polygon (constant size, resolved server-side) — indices are
 * the fallback for cameras without an exact screen -> data mapping. Id
 * lists never go over the wire.
 */
export async function fetchLassoStage(
  datasetName: string,
  brainKey: string,
  view: unknown[],
  selection: { polygon: Array<[number, number]> } | { indices: number[] },
): Promise<LassoStage> {
  return getFetchFunction()<Record<string, unknown>, LassoStage>(
    "POST",
    "/embeddings/v2/lasso-stage",
    { datasetName, brainKey, view, slices: null, ...selection },
  );
}

export interface SampleInfo {
  id: string;
  sampleId: string;
  filepath: string | null;
  /** Feed through the App's getSampleSrc(); null = no hover media */
  media: string | null;
  value: unknown;
}

export async function fetchSampleInfo(
  datasetName: string,
  brainKey: string,
  index: number,
  field: string | null,
): Promise<SampleInfo> {
  return getFetchFunction()<Record<string, unknown>, SampleInfo>(
    "POST",
    "/embeddings/v2/sample-info",
    { datasetName, brainKey, index, field },
  );
}

/** Id -> wire-order-index map over the first `count` (default: all)
 * entries, for styling external selections */
export function buildIdIndex(
  ids: IdColumn,
  count?: number,
): Map<string, number> {
  const n = count ?? ids.length / 12;
  const map = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    map.set(idAt(ids, i), i);
  }
  return map;
}

async function fetchColumn(
  path: string,
  body: Record<string, unknown>,
): Promise<ArrayBuffer> {
  return getFetchFunction()<Record<string, unknown>, ArrayBuffer>(
    "POST",
    path,
    body,
    "arrayBuffer",
  );
}
