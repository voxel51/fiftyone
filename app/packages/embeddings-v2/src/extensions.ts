/**
 * The panel's edition seam. Shared panel code never imports `enterprise/`;
 * an edition registers a {@link EmbeddingsPanelExtension} here (from the
 * package barrel's one edition-specific import) and the panel consults it
 * through capability-named hooks with inert fallbacks. Registration happens
 * at module load — before any render — so the extension's hooks have stable
 * identities and shared hooks may call them under the rules of hooks.
 *
 * The contract is deliberately generic: a run source that may own its
 * geometry and color columns client-side, a feature surface of masks,
 * slots and callbacks. No extension domain vocabulary appears here — what
 * a point IS beyond (index, id) is the extension's business, carried in
 * the opaque `extState` slot its source hook hands its features hook back.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import type { CallbackInterface } from "recoil";
import type { HoverContent } from "./HoverCard";
import type { CategoricalFilter } from "./legendFilter";
import type {
  ColorResponse,
  ColorValues,
  ColorMeta,
  IdColumn,
  VisualizationRun,
} from "./protocol";
import type {
  EmbeddingPoint,
  EmbeddingsViewHandle,
  HoverHit,
  InteractionMode,
} from "./renderer";
import type { Loaded } from "./useRunColumns";
import { useLocalColorMask } from "./useLocalColorMask";

/** The panel's interaction mode. Kept open beyond the renderer's own two so
 * a mode can be added without threading a new type through every cell. */
export type PanelMode = InteractionMode | (string & NonNullable<unknown>);

/** Streams a run's geometry client-side. Present only once the extension
 * holds the run's access path; absent → server streaming. */
export type GeometryLoader = (
  onProgress: (points: EmbeddingPoint[], ids: IdColumn, total: number) => void,
) => Promise<{ points: EmbeddingPoint[]; ids: IdColumn; total: number }>;

/** A color-column resolver the extension supplies for fields it owns,
 * replacing the id-keyed server stream. `resolve` calls `onPartial`
 * synchronously when the column is already resident, so a local field never
 * flashes uncolored. */
export interface ColorColumnSource {
  /** The fields offered for color-by. */
  choices: string[];
  /** `signal` (when the host passes one) releases this resolve's interest in
   * the column — the host superseded the field or unmounted. Sources may
   * ignore it; sources with cancellable work stop when every interested
   * caller has released. */
  resolve: (
    field: string,
    onPartial: (partial: ColorResponse) => void,
    signal?: AbortSignal,
  ) => Promise<ColorResponse>;
  /** Changes whenever the source's SEMANTICS change (its choices or what
   * `resolve` would answer) under the same dataset and run — e.g. a run
   * recomputed in place. Consumers re-resolve on it instead of on object
   * identity, which extension hooks may recreate every render. Optional:
   * omitted means identity-stable semantics per (dataset, brainKey). */
  revision?: string | number;
  /** `choices` is INCOMPLETE — more are still resolving. A source whose
   * fields arrive on a later round trip sets this so the host can say so:
   * a short list reads as "this run has no such fields", and a reader who
   * concludes that closes the menu and does not look again. Must go false
   * when the round trip settles, failure included, or the host spins
   * forever. */
  pending?: boolean;
}

/** What the extension's early per-run hook owns. */
export interface RunColumnSource {
  /** The run's points are the extension's to read; the geometry stream must
   * wait for `loadGeometry` instead of falling back to the server. */
  ownsGeometry: boolean;
  loadGeometry: GeometryLoader | null;
  colorSource: ColorColumnSource | null;
  /** Whether the server can answer view/filter masks for this run. An
   * extension-owned run resolves its own masks from its storage, and its
   * points are not sample-keyed, so the server cannot answer for it. */
  serverMasks: boolean;
  /** Extension internals for its features hook. Opaque to shared code. */
  extState: unknown;
}

/** Joins the single Recoil commit a selection publishes in (stage + count +
 * whatever the extension decorates it with — one invalidation, not one per
 * setter). */
export type SelectionDecorator = (
  cb: Pick<CallbackInterface, "set" | "reset">,
) => void;

/** Commits stage + count + the extension's decoration in ONE batched
 * commit (see useRunPlotData). A caller already inside a Recoil transaction
 * passes its interface as `io` so the publish joins that commit — a second
 * transaction is a second sidebar-aggregation round. */
export type PublishSelection = (
  next: {
    stage?: Record<string, unknown> | null;
    /** Selected points. One sample can own many points. */
    count?: number | null;
    /** Distinct selected samples; null when only points are knowable. */
    sampleCount?: number | null;
    decorate?: SelectionDecorator | null;
  },
  io?: Pick<CallbackInterface, "set" | "reset">,
) => void;

/** Everything a client-side lasso resolver needs to build a view stage. */
export interface LassoStageInput {
  indices: number[];
  polygon: Array<[number, number]> | null;
  ids: IdColumn;
  view: unknown[];
  patchesField: string | null;
  pointsField: string | null;
}

/** The shared state the features hook composes against. */
export interface RunFeaturesContext {
  datasetName: string | null;
  brainKey: string;
  run: VisualizationRun;
  source: RunColumnSource;
  /** The App's sidebar filters, verbatim. */
  filters: unknown;
  colorField: string | null;
  /** The color-by field's key in the filters record — the grid-view
   * vocabulary path (see filterPath.ts), not necessarily `colorField`. */
  filterPath: string | null;
  colorValues: ColorValues | null;
  colorMeta: ColorMeta | null;
  /** The run's wire-order id column and how many points are loaded. */
  loadedIds: IdColumn | null;
  loadedCount: number;
  /** The run's full point count. Above `loadedCount` while chunks are still
   * landing, so an interaction can say it acted on part of the run. */
  loadedTotal: number;
  /** What the view leaves on screen, per point, in wire order — filters, view
   * stages and the legend, together.
   *
   * A REF because the mask is derived from what this hook returns, so it does
   * not exist when the hook runs. Read it when an interaction happens, never
   * during render: a search needs what is visible at the moment it is issued.
   */
  visibleRef: { current: Uint8Array | null };
  publishSelection: PublishSelection;
  setOverrideStage: (stage: Record<string, unknown> | null) => void;
  resetExtended: () => void;
}

/** An action offered on the hover card for extensions that can act on a
 * single point. */
export interface HoverAction {
  label: string;
  run: (hit: HoverHit) => void;
  /** The action it started is still running. The button says so itself —
   * spinning where its icon was — rather than through a notice somewhere
   * else on the plot, which is not where the reader is looking. */
  loading?: boolean;
}

/** Everything the shared shell hands the plot-area slot: the run-level
 * arrays and handlers a cell renders through. The extension composes these
 * into its own layout (cells share arrays; never filtered copies). */
export interface SharedPlotProps {
  loaded: Loaded;
  colors: Float32Array | null;
  /** Plot-level visibility over the shared arrays; null = all visible. */
  visible: Uint8Array | null;
  /** Cross-plot point emphasis (grid selection). */
  selected: number[] | null;
  /** Already mapped to the renderer's own modes. */
  mode: InteractionMode;
  panelMode: PanelMode;
  zCamera?: () => Promise<unknown>;
  onLasso: (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => void;
  onPointClick: ((hit: HoverHit) => void) | undefined;
  onBackgroundClick: () => void;
  onError: (e: Error) => void;
  onHover: (hit: HoverHit | null) => void;
  onKeepHover: () => void;
  /** The hover card is frozen on a clicked point. */
  pinned: boolean;
  /** Releases the freeze; the card renders it as its close control. */
  onClosePinned: () => void;
  hover: HoverContent | null;
  /** The live hovered hit, before the card's dwell — anchors the ring. */
  hoverHit: HoverHit | null;
  hoverAction: HoverAction | null;
  registerChart: (key: string, handle: EmbeddingsViewHandle | null) => void;
}

/** The per-run feature surface the shared panel renders through. Everything
 * here has an inert default, so the panel without an extension (or a run the
 * extension does not own) is exactly the plain server-backed plot. */
export interface RunFeatures {
  /** Sidebar filters minus what the extension evaluated locally;
   * identity-stable so downstream effects don't refire. */
  serverFilters: unknown;
  /** Wire-aligned mask of the locally-evaluated filters; null = all pass. */
  localMask: Uint8Array | null;
  /** A filter column resolution is in flight. */
  filterLoading: boolean;
  /** The color field's legend hide/isolate must be folded into plot
   * visibility here — the server's filter path cannot evaluate the field. */
  foldLegendLocally: boolean;
  /** What produced the current selection ("lasso", or an extension-defined
   * origin); drives background-click layer peeling. */
  selectionOrigin: string | null;
  /** Hover-card content from resident data (no fetch); null → server path.
   *
   * `pinned` says the reader CLICKED this point rather than passed over it,
   * which is the only place work too expensive for a hover belongs. */
  localDetail: (hit: HoverHit, pinned?: boolean) => HoverContent | null;
  /** The legend just changed the color field's filter (null = cleared);
   * extensions sync their own selection artifacts to it. Called INSIDE the
   * legend click's transaction, whose interface is `io` — publishing through
   * it keeps the whole gesture one commit. */
  onLegendFilterChange: (
    next: CategoricalFilter | null,
    io?: Pick<CallbackInterface, "set" | "reset">,
  ) => void;
  /** Joins each published selection's commit; called with the kept wire
   * indices (null = selection cleared). */
  decorateSelection: ((kept: number[] | null) => SelectionDecorator) | null;
  /** Client-side lasso → view stage; null falls back to the server route. */
  resolveLassoStage:
    | ((input: LassoStageInput) => Record<string, unknown> | null)
    | null;
  /** An extension's own controls floated over the plot area, positioning
   * themselves inside the scene. For what belongs on the plot rather than in
   * the toolbar — a search over the points, a read-out of what is drawn. */
  plotOverlay: ReactNode;
  hoverAction: HoverAction | null;
  /** Header controls rendered before the color-by menu. */
  headerControls: ReactNode;
  /** A non-error notice row under the header (e.g. capped/overflow info). */
  banner: string | null;
  /** A dismissible floating notice over the plot. */
  notice: { text: string; dismiss: () => void } | null;
  renderSettingsBefore?: (close: () => void) => ReactNode;
  renderSettingsAfter?: (close: () => void) => ReactNode;
  /** Replaces the plot area (the single full-size cell) with the
   * extension's own layout over the same shared arrays; null → the shell
   * renders one cell. */
  renderPlotArea: ((shared: SharedPlotProps) => ReactNode) | null;
}

export interface EmbeddingsPanelExtension {
  /** Early per-run hook: whether the extension owns the run's columns, and
   * the client-side loaders when it does. Runs before the geometry stream so
   * an owned run never round-trips. */
  useRunSource: (
    datasetName: string | null,
    brainKey: string,
    runTimestamp: string | null,
  ) => RunColumnSource;
  /** Late per-run hook: filter masks, slots, selection decoration. Runs
   * after the color column resolves. */
  useRunFeatures: (ctx: RunFeaturesContext) => RunFeatures;
}

let extension: EmbeddingsPanelExtension | null = null;
let generation = 0;
const listeners = new Set<() => void>();

/**
 * Registers the edition's extension. Called at module load by the edition
 * entrypoint — possibly a dynamically imported one, so registration may land
 * after a panel has already mounted; the panel keys its plot on
 * {@link useExtensionGeneration} and remounts cleanly (the extension's hooks
 * must never swap under a mounted component — rules of hooks). The returned
 * unregister exists for HMR disposal.
 */
export function registerEmbeddingsPanelExtension(
  ext: EmbeddingsPanelExtension,
): () => void {
  extension = ext;
  generation++;
  listeners.forEach((notify) => notify());
  return () => {
    if (extension === ext) {
      extension = null;
      generation++;
      listeners.forEach((notify) => notify());
    }
  };
}

export function getEmbeddingsPanelExtension(): EmbeddingsPanelExtension | null {
  return extension;
}

const subscribe = (notify: () => void): (() => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};
const getGeneration = () => generation;

/**
 * The registry's change counter, for keying components that select the
 * extension's hooks at mount (a late registration then remounts them rather
 * than swapping hooks under them).
 */
export function useExtensionGeneration(): number {
  return useSyncExternalStore(subscribe, getGeneration);
}

const FALLBACK_SOURCE: RunColumnSource = {
  ownsGeometry: false,
  loadGeometry: null,
  colorSource: null,
  serverMasks: true,
  extState: null,
};

const noop = () => undefined;
const NO_DETAIL = () => null;

/** The no-extension run source: server geometry, server masks. */
export function useFallbackRunSource(): RunColumnSource {
  return FALLBACK_SOURCE;
}

/** The no-extension features: the color field's sidebar filter evaluates
 * locally against the column already in hand (legend clicks stay instant),
 * everything else passes through to the server. */
export function useFallbackRunFeatures(ctx: RunFeaturesContext): RunFeatures {
  const { localMask, serverFilters } = useLocalColorMask(
    ctx.filters as Record<string, unknown> | null | undefined,
    ctx.filterPath,
    ctx.colorValues,
    ctx.colorMeta,
  );
  return {
    serverFilters,
    localMask,
    filterLoading: false,
    foldLegendLocally: false,
    selectionOrigin: null,
    localDetail: NO_DETAIL,
    onLegendFilterChange: noop,
    decorateSelection: null,
    resolveLassoStage: null,
    plotOverlay: null,
    hoverAction: null,
    headerControls: null,
    banner: null,
    notice: null,
    renderPlotArea: null,
  };
}
