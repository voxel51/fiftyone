import { resetFrameStores, zoomAspectRatio } from "@fiftyone/looker";
import type { paginateSamplesQuery } from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { type Schema } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VariablesOf } from "react-relay";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import { gridAspectRatio, gridSpineTotal, parseAspectRatio } from "./recoil";
import type { Records } from "./useRecords";

export const PAGE_SIZE = 40;

export type SampleStore = WeakMap<ID, { sample: fos.Sample; index: number }>;

// The ordered id backbone: ids for the view, fetched in large chunks and cached so the
// scroll range can be laid out without paging the heavy data.
// Client-cached spine for random-access reads: an `after=start` window fills only its
// own indices, so deep jumps never page from 0. `windowLocks` dedupes concurrent fetches.
interface SpineCache {
  byIndex: Map<number, fos.SpineEntry>;
  windowLocks: Map<number, Promise<void>>;
  // the view's item count, learned when a spine window comes back exhausted
  // (`next: null`); null for a flat dataset until the end is reached.
  total: number | null;
}

// A grid sample node. A placeholder is a missing store entry: its id is known from the
// spine but its sample/media is not loaded; hydrated on settle.
export type GridNode = fos.SampleRow & {
  sample: fos.Sample;
};

export const isPlaceholder = (node: GridNode | undefined): boolean =>
  !node || !node.urls || node.urls.length === 0;

// Aspect ratio from stored dimensions in the field payload (no media open).
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
  records: Map<string, number>,
  groupFields: string | string[] | undefined
) => {
  return rows.map((row, i) => {
    // assemble the runtime sample from the projected field slice
    const node = { ...row, sample: row.fields } as GridNode;
    // rebuild `_group` here, where `node.sample` exists (a raw row has only `.fields`)
    reconstructGroup(node, groupFields, schema);
    const id = { description: node.id };

    store.set(id, node);
    records.set(node.id, page * PAGE_SIZE + i);

    // auto-AR: prefer the server's value, else stored dimensions; the `?? 1` is a
    // transient estimate for media whose dimensions aren't known until decode.
    const aspectRatio =
      node.aspectRatio ?? aspectRatioFromMetadata(node.sample) ?? 1;

    return {
      key: page,
      aspectRatio: zoom
        ? zoomAspectRatio(node.sample, schema, aspectRatio)
        : aspectRatio,
      id,
      data: node as unknown as fos.Sample,
    };
  });
};

interface GroupByView {
  // base view with any GroupBy stage stripped, so the server compiles a plain indexed
  // `$match`/`$project` instead of re-grouping the whole collection.
  view: unknown[];
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

// Reads a group-by field's value off a returned sample by its db field name —
// FiftyOne stores some fields (e.g. `sample_id`) under a different db key
// (`_sample_id`), so the document key isn't always the field name.
const groupFieldValue = (
  s: Record<string, unknown>,
  field: string,
  schema: Schema | undefined
): unknown => {
  const dbField = schema?.[field]?.dbField;
  if (dbField && s[dbField] !== undefined) return s[dbField];
  return s[field];
};

// Rebuilds the `_group` key the ImaVid looker needs from the group-by field
// VALUES on a returned sample (GroupBy was stripped server-side for speed).
const reconstructGroup = (
  node: GridNode,
  groupFields: string | string[] | undefined,
  schema: Schema | undefined
) => {
  if (!groupFields || !node.sample) return;
  const s = node.sample as Record<string, unknown>;
  node.sample = {
    ...s,
    _group: Array.isArray(groupFields)
      ? groupFields.map((f) => groupFieldValue(s, f, schema))
      : groupFieldValue(s, groupFields, schema),
  } as unknown as typeof node.sample;
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
  // auto-AR publishes the spine's group total here so the counter shows groups, not
  // raw samples; fixed-AR's InfiniteGrid publishes the same atom.
  const setSpineTotal = useSetRecoilState(gridSpineTotal);
  const store: SampleStore = useMemo(() => new WeakMap(), []);
  // shared id-keyed sample cache the modal reads, so opening a hydrated grid sample
  // needs no query.
  const lookerStore = fos.useLookerStore();
  const lookerResetRef = useRef(clearRecords);
  useEffect(() => {
    if (lookerResetRef.current === clearRecords) return;
    lookerResetRef.current = clearRecords;
    lookerStore.reset();
    // a view/filter change invalidates frame content; detach never drops these caches.
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

  // Coalesces a settle's tile hydration requests into a single batched read, narrowed
  // to the window ids with an indexed `$match`. Returns the built nodes by id.
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

                // fetch straight by id; strip any GroupBy stage so the server compiles
                // a plain indexed `$match {_id: $in}` instead of re-grouping. `_group`
                // is reconstructed client-side from the returned field values.
                const datasetId = await snapshot.getPromise(fos.datasetId);
                if (!datasetId) return resolve(out);
                const schema = await snapshot.getPromise(
                  fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
                );
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
                  // the ids came from a slice-filtered spine; resolve the same slice
                  // here or `select(ids)` finds nothing in the default-slice view
                  filter: base.filter,
                  sortBy: base.sortBy as string | undefined,
                  desc: base.desc as boolean | undefined,
                  hint: base.hint as string | undefined,
                  // tiles lay out from the spine's aspect ratio — skip media opens
                  skipMetadata: true,
                });

                for (const row of rows) {
                  // assemble the runtime sample from the projected field slice
                  const node = { ...row, sample: row.fields } as GridNode;
                  reconstructGroup(node, groupFields, schema);
                  // the by-id fetch strips GroupBy, so carry the spine's group count
                  // onto the sample — the modal seeds the imavid total from it.
                  const spineIndex = records.get(node.id);
                  const groupCount =
                    spineIndex != null
                      ? spine.byIndex.get(spineIndex)?.groupCount
                      : undefined;
                  if (groupCount != null) {
                    (node.sample as Record<string, unknown>)._group_count =
                      groupCount;
                  }
                  out.set(node.id, node);
                  // mirror into the shared cache so the modal renders with zero queries
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
    [lookerStore, pageSelector, records, spine]
  );

  // Random-access spine read for the virtual grid: returns the entries for indices
  // [start, start+count), fetching only that window when missing (never prior pages).
  const ensureSpineWindow = useRecoilCallback(
    ({ snapshot }) =>
      async (start: number, count: number): Promise<fos.SpineEntry[]> => {
        // justified (auto) layout needs per-item ARs; a fixed ratio keeps the
        // spine an index-only read
        const wantAr =
          parseAspectRatio(await snapshot.getPromise(gridAspectRatio)) === null;

        const slice = () => {
          const out: fos.SpineEntry[] = [];
          for (let i = start; i < start + count; i++) {
            const e = spine.byIndex.get(i);
            if (e) out.push(e);
          }
          return out;
        };

        const missing = () => {
          // cap at the known total so a window overrunning the end isn't treated as
          // missing and refetched.
          const cap =
            spine.total != null
              ? Math.min(start + count, spine.total)
              : start + count;
          for (let i = start; i < cap; i++) {
            const e = spine.byIndex.get(i);
            if (!e) return true;
            // fixed -> auto: a cached fixed-mode entry has no aspect ratio
            // (undefined); refetch so justified gets real per-tile ratios. A null
            // AR is a valid auto value (sample without metadata) — don't refetch it.
            if (wantAr && e.aspectRatio === undefined) return true;
          }
          return false;
        };

        if (missing()) {
          let inflight = spine.windowLocks.get(start);
          if (!inflight) {
            inflight = (async () => {
              const id = await snapshot.getPromise(fos.datasetId);
              if (!id) return;
              // send the SAME view params paginateSamples uses, so the spine order
              // and grouping match exactly (filters/sort applied; dynamic groups —
              // whose GroupBy stage lives in `view` — page by group).
              const base = (await snapshot.getPromise(pageSelector))(
                0,
                PAGE_SIZE
              ) as Record<string, unknown>;
              const resp = await fos.fetchSpine({
                datasetId: id,
                after: start,
                view: base.view,
                filters: base.filters,
                filter: base.filter,
                sortBy: base.sortBy as string | undefined,
                desc: base.desc as boolean | undefined,
                // same index hint paginateSamples uses, so the spine's $skip walks
                // index entries instead of scanning docs at deep offsets
                hint: base.hint as string | undefined,
                aspectRatio: wantAr,
              });
              const got = resp?.spine ?? [];
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

  // the view's true item count once the spine reaches its end, else null; the grid
  // clamps its layout to this so a filtered/grouped view isn't sized to the dataset.
  const spineTotal = useCallback(() => spine.total, [spine]);

  // Cursor pager for the legacy Spotlight path (auto-AR): reuses the spine to group,
  // then fetches the poster ids with media metadata for per-tile aspect ratios.
  const page = useRecoilCallback(
    ({ snapshot }) =>
      async (pageNumber: number): Promise<Response<number, fos.Sample>> => {
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
        );
        const datasetId = await snapshot.getPromise(fos.datasetId);
        const gridFields = await snapshot.getPromise(fos.gridSampleFields);
        pages.add(pageNumber);
        if (!datasetId) return { items: [], next: null, previous: null };

        const start = pageNumber * PAGE_SIZE;
        const base = pager(0, PAGE_SIZE) as unknown as Record<string, unknown>;
        const { view, groupFields, orderBy } = stripGroupBy(base);
        const fields = fieldsWithGroup(gridFields, groupFields, orderBy);

        let rows: fos.SampleRow[];
        let hasMore: boolean;

        if (groupFields) {
          // dynamic group: group via the cached spine (no per-page re-group), then
          // fetch those posters by id (indexed `$match {_id:$in}`), opening media so
          // auto-AR has per-tile ratios. `_group` is rebuilt per poster downstream.
          const spineEntries = await ensureSpineWindow(start, PAGE_SIZE);
          // publish the accurate GROUP total — the counter must never show raw samples
          setSpineTotal(spineTotal());
          if (!spineEntries.length) {
            return {
              items: [],
              next: null,
              previous: pageNumber > 0 ? pageNumber - 1 : null,
            };
          }
          const ids = spineEntries.map((e) => e.id);
          const fetched = await fos.fetchSamples({
            datasetId,
            ids,
            count: ids.length,
            fields,
            view,
            filters: base.filters,
            sortBy: base.sortBy as string | undefined,
            desc: base.desc as boolean | undefined,
            hint: base.hint as string | undefined,
            skipMetadata: false,
          });
          // fetch-by-id is unordered; restore the spine's group order
          const byId = new Map(fetched.map((r) => [r.id, r]));
          rows = ids
            .map((id) => byId.get(id))
            .filter(Boolean) as fos.SampleRow[];
          // the by-id fetch strips GroupBy, so carry the spine's group count onto each
          // poster so the imavid modal seeds its total without a count query
          const countById = new Map(
            spineEntries.map((e) => [e.id, e.groupCount])
          );
          for (const row of rows) {
            const gc = countById.get(row.id);
            if (gc != null) {
              (row.fields as Record<string, unknown>)._group_count = gc;
            }
          }
          const total = spineTotal();
          hasMore =
            total != null
              ? start + PAGE_SIZE < total
              : spineEntries.length === PAGE_SIZE;
        } else {
          // flat view: a single offset read — no extra spine round-trip. Its count
          // comes from the aggregation, so don't drive the spine-total atom.
          setSpineTotal(null);
          rows = await fos.fetchSamples({
            datasetId,
            after: start,
            count: PAGE_SIZE,
            fields,
            view,
            filters: base.filters,
            sortBy: base.sortBy as string | undefined,
            desc: base.desc as boolean | undefined,
            hint: base.hint as string | undefined,
            skipMetadata: base.skipMetadata as boolean | undefined,
          });
          hasMore = rows.length === PAGE_SIZE;
        }

        const items = processSamplePageData(
          pageNumber,
          store,
          rows,
          schema,
          zoom,
          records,
          groupFields
        );
        for (const item of items) keys.current.add(item.id.description);

        return {
          items,
          next: hasMore ? pageNumber + 1 : null,
          previous: pageNumber > 0 ? pageNumber - 1 : null,
        };
      },
    [
      pager,
      pages,
      records,
      store,
      zoom,
      ensureSpineWindow,
      spineTotal,
      setSpineTotal,
    ]
  );

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
