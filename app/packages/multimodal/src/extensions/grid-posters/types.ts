/** Media semantics retained with a poster supplied by a product extension. */
export type GridPosterMediaKind = "image" | "video" | "point-cloud";

/** Minimal camera pose exposed without coupling extensions to a renderer. */
export interface GridPosterCameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/** Durable provenance for a poster supplied outside the live preview path. */
export interface GridPosterProviderMetadata {
  readonly artifactIdentity: string;
  readonly id: string;
  readonly mediaKind: GridPosterMediaKind;
  readonly policyVersion: string;
  readonly revision: string | null;
  readonly variant: string;
}

/** Product-neutral selection facts exposed by the grid renderer. */
export interface GridPosterProviderSelectionContext {
  readonly cameraPose: GridPosterCameraPose | null;
  readonly posterStartTimeNs: bigint | null;
  readonly selectedSourceName: string | null;
}

/** One immutable poster candidate selected by a provider descriptor. */
export interface GridPosterProviderSelection {
  readonly byteLength: number;
  readonly height: number;
  readonly identity: string;
  readonly load: (signal: AbortSignal) => Promise<Uint8Array>;
  readonly mediaKind: GridPosterMediaKind;
  readonly mimeType: string;
  readonly policyVersion: string;
  readonly sourceKind: "image" | "point-cloud";
  readonly streamId: string | null;
  readonly streamSourceName: string | null;
  readonly streamSourceNames: readonly string[];
  readonly variant: string;
  readonly width: number;
}

/** Opaque provider result used to key and select a cold-tier poster. */
export interface GridPosterProviderDescriptor {
  readonly cacheRevision: string | null;
  readonly select: (
    context: GridPosterProviderSelectionContext,
  ) => GridPosterProviderSelection | null;
}

/** Resolve context for a single visible grid sample. */
export interface GridPosterProviderResolveContext {
  readonly datasetId: string;
  readonly sampleId: string;
}

/** Optional product-edition source for precomputed grid posters. */
export interface GridPosterProvider {
  readonly id: string;
  readonly resolveDescriptor: (
    context: GridPosterProviderResolveContext,
    signal: AbortSignal,
  ) => Promise<GridPosterProviderDescriptor | null>;
}
