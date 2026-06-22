import { resetFrameStores, zoomAspectRatio } from "@fiftyone/looker";
import type { paginateSamplesQuery } from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { getFetchFunction, type Schema } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VariablesOf } from "react-relay";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import type { Records } from "./useRecords";

export const PAGE_SIZE = 40;

export type SampleStore = WeakMap<ID, { sample: fos.Sample; index: number }>;

// The cheap ordered driver: ids for the view, fetched in large chunks and cached so
// the whole scroll range can be laid out without paging the heavy data. Aspect ratio
// is NOT here — the grid lays tiles out from its `gridAspectRatio` SETTING
// (`useSpineLayout`); the spine is purely the ordered id backbone.
export interface SpineEntry {
  id: string;
}

interface SpineResponse {
  spine: SpineEntry[];
  next: number | null;
}

// Client-cached spine for the virtual grid's RANDOM-ACCESS reads: a window fetched
// with `after=start` fills indices start..start+resp.length, so jumping to page 10k
// never touches pages 0..9,999. `windowLocks` dedupes concurrent fetches of the
// same offset.
interface SpineCache {
  byIndex: Map<number, SpineEntry>;
  windowLocks: Map<number, Promise<void>>;
  // the view's TRUE item count, learned when a spine window comes back exhausted
  // (`next: null`). For a flat dataset this stays null until the end is reached (the
  // layout uses the dataset estimate); for a filtered/grouped/dynamic-group view it
  // resolves on the first short window, so the layout isn't sized to the whole
  // dataset (which would create phantom tiles + pointless past-end spine fetches).
  total: number | null;
}

// A grid sample node (a `SampleRow` from the REST samples endpoint). A PLACEHOLDER
// is simply a missing store entry — its id is known from the spine but its
// sample/media is not loaded; only the layout (uniform tiles) needs no data.
// `showItem` hydrates it on settle.
export type GridNode = fos.SampleRow & {
  sample: fos.Sample;
};

export const isPlaceholder = (node: GridNode | undefined): boolean =>
  !node || !node.urls || node.urls.length === 0;

// Real aspect ratio from stored dimensions in the field payload (no media open, no
// placeholder): width/height for images, frame_width/frame_height for video.
const aspectRatioFromMetadata = (
  sample: Record<string, unknown> | undefined
): number | undefined => {
  const md = (sample?.metadata ?? {}) as Record<string, number | undefined>;
  const width = md.width ?? md.frame_width;
  const height = md.height ?? md.frame_height;
  return width && height ? width / height : undefined;
};

const processSamplePageData = (
  page: number,
  store: WeakMap<ID, object>,
  rows: fos.SampleRow[],
  schema: Schema,
  zoom: boolean,
  records: Map<string, number>
) => {
  return rows.map((row, i) => {
    // assemble the runtime sample from the projected field slice
    const node = { ...row, sample: row.fields } as GridNode;
    const id = { description: node.id };

    store.set(id, node);
    records.set(node.id, page * PAGE_SIZE + i);

    // Auto-AR sizes each tile by its own ratio: prefer the server's value (auto mode
    // returns it), else derive from REAL stored dimensions already in the payload
    // (metadata.width/height, or frame_width/height for video). The final `?? 1` is a
    // transient justified-layout estimate ONLY for media whose dimensions aren't known
    // until decode — corrected when the looker loads; it is never stored/propagated.
    const aspectRatio =
      node.aspectRatio ?? aspectRatioFromMetadata(node.sample) ?? 1;

    return {
      key: page,
      aspectRatio: zoom
        ? zoomAspectRatio(node.sample, schema, aspectRatio)
        : aspectRatio,
      id,
      data: node as fos.Sample,
    };
  });
};

interface GroupByView {
  // base view with any GroupBy stage stripped, so the server compiles a plain
  // indexed `$match`/`$project` instead of re-grouping the whole collection.
  view: unknown[];
  // the group-by field path(s) and optional order-by field — appended to the
  // requested `fields` so the client can reconstruct `_group` per sample.
  groupFields: string | string[] | undefined;
  orderBy: string | undefined;
}

// Strips the GroupBy stage from a base view and surfaces the group-by/order
// fields so the lean REST payload can carry them and rebuild `_group` client-side.
const stripGroupBy = (base: Record<string, unknown>): GroupByView => {
  const baseView =
    (base.view as Array<{ _cls: string; kwargs: [string, unknown][] }>) ?? [];
  const groupByStage = baseView.find(
    (s) => s?._cls === "fiftyone.core.stages.GroupBy"
  );
  const groupFields = groupByStage?.kwargs?.find(
    (kv) => kv[0] === "field_or_expr"
  )?.[1] as string | string[] | undefined;
  const orderBy = groupByStage?.kwargs?.find(
    (kv) => kv[0] === "order_by"
  )?.[1] as string | undefined;
  return {
    view: baseView.filter((s) => s !== groupByStage),
    groupFields,
    orderBy,
  };
};

// Appends the dynamic group-by/order fields to the grid's overlay field list so
// the lean REST payload returns the values needed to rebuild `_group`.
const fieldsWithGroup = (
  base: string[],
  groupFields: string | string[] | undefined,
  orderBy: string | undefined
): string[] => {
  const extra: string[] = [];
  if (Array.isArray(groupFields)) extra.push(...groupFields);
  else if (groupFields) extra.push(groupFields);
  if (orderBy) extra.push(orderBy);
  return Array.from(new Set([...base, ...extra]));
};

// Rebuilds the `_group` key the ImaVid looker needs from the group-by field
// VALUES on a returned sample (GroupBy was stripped server-side for speed).
const reconstructGroup = (
  node: GridNode,
  groupFields: string | string[] | undefined
) => {
  if (!groupFields || !node.sample) return;
  const s = node.sample as Record<string, unknown>;
  node.sample = {
    ...s,
    _group: Array.isArray(groupFields)
      ? groupFields.map((f) => s[f])
      : s[groupFields],
  } as typeof node.sample;
};

const useSpotlightPager = ({
  clearRecords,
  pageSelector,
  records,
  zoomSelector,
}: {
  clearRecords: string;
  pageSelector: RecoilValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<paginateSamplesQuery>
  >;
  records: Records;
  zoomSelector: RecoilValueReadOnly<boolean>;
}) => {
  const pager = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector);
  const store: SampleStore = useMemo(() => new WeakMap(), []);
  // shared id-keyed sample cache (the `stores` registry that `useUpdateSamples` and
  // the modal read) — so opening a hydrated grid sample in the modal needs NO query.
  const lookerStore = fos.useLookerStore();
  const lookerResetRef = useRef(clearRecords);
  useEffect(() => {
    if (lookerResetRef.current === clearRecords) return;
    lookerResetRef.current = clearRecords;
    lookerStore.reset();
    // view/filter change invalidates frame content — drop the persistent native-video
    // frame caches (detach never does; only a real view change does).
    resetFrameStores();
  }, [clearRecords, lookerStore]);

  const keys = useRef(new Set<string>());

  const pages = useMemo(() => {
    /** Track already requested pages */
    clearRecords;
    return new Set();
  }, [clearRecords]);

  // The id spine, reset whenever records reset.
  const spine = useMemo<SpineCache>(() => {
    clearRecords;
    return {
      byIndex: new Map(),
      windowLocks: new Map(),
      total: null,
    };
  }, [clearRecords]);

  // The cursor pager used by the legacy Spotlight engine path (auto aspect ratio);
  // the fixed-AR infinite grid uses ensureSpineWindow/hydrateWindow instead. Reads
  // a page of samples from the unified REST endpoint by numeric offset.
  const page = useRecoilCallback(
    ({ snapshot }) => {
      return async (
        pageNumber: number
      ): Promise<Response<number, fos.Sample>> => {
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
        );
        const datasetId = await snapshot.getPromise(fos.datasetId);
        const gridFields = await snapshot.getPromise(fos.gridSampleFields);
        pages.add(pageNumber);
        if (!datasetId) return { items: [], next: null, previous: null };

        const base = pager(0, PAGE_SIZE) as unknown as Record<string, unknown>;
        const { view, groupFields, orderBy } = stripGroupBy(base);
        const fields = fieldsWithGroup(gridFields, groupFields, orderBy);

        const rows = await fos.fetchSamples({
          datasetId,
          after: pageNumber * PAGE_SIZE,
          count: PAGE_SIZE,
          fields,
          view,
          filters: base.filters,
          sortBy: base.sortBy as string | undefined,
          desc: base.desc as boolean | undefined,
          hint: base.hint as string | undefined,
          // auto-AR (this legacy Spotlight path) sizes each tile by its OWN ratio, so
          // the server must compute it; fixed-AR never reaches here. base carries the
          // grid's skipMetadata (false in auto/autosize, true at a fixed ratio).
          skipMetadata: base.skipMetadata as boolean | undefined,
        });

        for (const row of rows) reconstructGroup(row as GridNode, groupFields);

        const items = processSamplePageData(
          pageNumber,
          store,
          rows,
          schema,
          zoom,
          records
        );
        for (const item of items) keys.current.add(item.id.description);

        // a full page implies there may be more; a short page is the end.
        return {
          items,
          next: rows.length === PAGE_SIZE ? pageNumber + 1 : null,
          previous: pageNumber > 0 ? pageNumber - 1 : null,
        };
      };
    },
    [pager, pages, records, store, zoom]
  );

  // Coalesces every visible tile's hydration request from one settled render pass
  // into a SINGLE batched read — the SAME `paginateSamples` query the grid uses,
  // narrowed to the window ids with an UNORDERED `Select` stage (indexed `$match`),
  // so overlays (boxes, masks, video poster frames) render exactly as in the normal
  // grid. Returns the built nodes by id; the renderer writes them into `store` (it
  // holds the IDs) and reads them by id, so the response order doesn't matter.
  const hydrate = useRef<{
    ids: Set<string>;
    promise: Promise<Map<string, GridNode>> | null;
  }>({ ids: new Set(), promise: null });

  const hydrateWindow = useRecoilCallback(
    ({ snapshot }) =>
      (sampleIds: ReadonlyArray<string>): Promise<Map<string, GridNode>> => {
        for (const sid of sampleIds) hydrate.current.ids.add(sid);
        if (!hydrate.current.promise) {
          hydrate.current.promise = new Promise<Map<string, GridNode>>(
            (resolve, reject) => {
              const run = async () => {
                const ids = [...hydrate.current.ids];
                hydrate.current.ids = new Set();
                hydrate.current.promise = null;
                const out = new Map<string, GridNode>();
                if (!ids.length) return resolve(out);

                // The spine already enumerated these reps — fetch them straight BY
                // ID from the unified REST endpoint. Strip any GroupBy stage so the
                // server compiles a plain indexed `$match {_id: $in}` + `$project`
                // instead of re-grouping the whole collection; the `_group` key the
                // ImaVid looker needs is reconstructed client-side from the group-by
                // field values returned in the lean payload.
                const datasetId = await snapshot.getPromise(fos.datasetId);
                if (!datasetId) return resolve(out);
                const gridFields = await snapshot.getPromise(
                  fos.gridSampleFields
                );
                const base = (await snapshot.getPromise(pageSelector))(
                  0,
                  PAGE_SIZE
                ) as unknown as Record<string, unknown>;
                const { view, groupFields, orderBy } = stripGroupBy(base);
                const fields = fieldsWithGroup(
                  gridFields,
                  groupFields,
                  orderBy
                );

                const rows = await fos.fetchSamples({
                  datasetId,
                  ids,
                  count: ids.length,
                  fields,
                  view,
                  filters: base.filters,
                  sortBy: base.sortBy as string | undefined,
                  desc: base.desc as boolean | undefined,
                  hint: base.hint as string | undefined,
                  // tiles lay out from the spine's aspect ratio — skip media opens
                  skipMetadata: true,
                });

                for (const row of rows) {
                  // assemble the runtime sample from the projected field slice
                  const node = { ...row, sample: row.fields } as GridNode;
                  reconstructGroup(node, groupFields);
                  out.set(node.id, node);
                  // mirror into the shared cache so the modal renders this sample
                  // with zero queries
                  lookerStore.samples.set(
                    node.id,
                    node as unknown as fos.ModalSample
                  );
                }
                resolve(out);
              };
              // batch on the microtask queue so one settle = one request; a fetch
              // failure rejects (never swallowed) so callers can surface/retry.
              queueMicrotask(() => {
                run().catch(reject);
              });
            }
          );
        }
        return hydrate.current.promise;
      },
    [lookerStore, pageSelector]
  );

  // Random-access spine read for the virtual grid: returns the `(id, aspectRatio)`
  // entries for absolute indices [start, start+count) — fetching ONLY that window
  // (`after=start`) when missing, never prior pages. Fills `byIndex` + `byId` and
  // the id->index `records` (selection); `windowLocks` dedupes concurrent fetches.
  const ensureSpineWindow = useRecoilCallback(
    ({ snapshot }) =>
      async (start: number, count: number): Promise<SpineEntry[]> => {
        const slice = () => {
          const out: SpineEntry[] = [];
          for (let i = start; i < start + count; i++) {
            const e = spine.byIndex.get(i);
            if (e) out.push(e);
          }
          return out;
        };

        const missing = () => {
          // Indices past the view's known total don't exist — they're not "missing",
          // so don't let a window that overruns the end trigger a redundant spine
          // fetch for ids already cached on the client.
          const cap =
            spine.total != null
              ? Math.min(start + count, spine.total)
              : start + count;
          for (let i = start; i < cap; i++) {
            if (!spine.byIndex.has(i)) return true;
          }
          return false;
        };

        if (missing()) {
          let inflight = spine.windowLocks.get(start);
          if (!inflight) {
            inflight = (async () => {
              const id = await snapshot.getPromise(fos.datasetId);
              if (!id) return;
              const url = `/dataset/${encodeURIComponent(id)}/grid/samples`;
              // send the SAME view params paginateSamples uses, so the spine order
              // and grouping match exactly (filters/sort applied; dynamic groups —
              // whose GroupBy stage lives in `view` — page by group).
              const base = (await snapshot.getPromise(pageSelector))(
                0,
                PAGE_SIZE
              ) as Record<string, unknown>;
              const t0 = performance.now();
              const resp = (await getFetchFunction()("POST", url, {
                spine: true,
                after: start,
                view: base.view,
                filters: base.filters,
                filter: base.filter,
                sortBy: base.sortBy,
                desc: base.desc,
                // same index hint paginateSamples uses, so the spine's $skip walks
                // index entries instead of scanning docs at deep offsets
                hint: base.hint,
              })) as SpineResponse;
              const got = resp?.spine ?? [];
              console.debug(
                `[grid-spine] after=${start} -> ${got.length} ids (next=${
                  resp?.next
                }) in ${Math.round(performance.now() - t0)}ms`
              );
              got.forEach((e, i) => {
                spine.byIndex.set(start + i, e);
                records.set(e.id, start + i);
              });
              // a window that came back NOT full (no next page) is the end of the
              // view → its last index is the TRUE item count. Only trust non-empty
              // windows (a past-end fetch returns nothing and must not set a total).
              if (resp?.next == null && got.length > 0) {
                spine.total = Math.min(
                  spine.total ?? Infinity,
                  start + got.length
                );
              }
            })();
            spine.windowLocks.set(start, inflight);
            inflight.finally(() => spine.windowLocks.delete(start));
          }
          await inflight;
        }

        return slice();
      },
    [records, spine, pageSelector]
  );

  // the view's true item count once the spine has reached its end, else null — the
  // grid clamps its layout to this so a filtered/grouped view isn't sized to the
  // whole dataset. Read during render (re-read on the grid's spine version bump).
  const spineTotal = useCallback(() => spine.total, [spine]);

  return {
    page,
    hydrateWindow,
    ensureSpineWindow,
    spineTotal,
    records,
    store,
  };
};

export default useSpotlightPager;
