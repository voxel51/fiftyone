import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { getFetchFunction, type Schema } from "@fiftyone/utilities";
import { useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import type { VariablesOf } from "react-relay";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import type { Subscription } from "relay-runtime";
import type { Records } from "./useRecords";
import useTimeout from "./useTimeout";
import { handleNode } from "./utils";

export const PAGE_SIZE = 20;

export type SampleStore = WeakMap<ID, { sample: fos.Sample; index: number }>;

// The cheap ordered driver: (id, aspectRatio) for the view, fetched in large
// chunks and cached so the whole scroll range can be laid out without paging the
// heavy data.
export interface SpineEntry {
  id: string;
  aspectRatio: number;
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
}

// A grid sample node (handleNode output). A PLACEHOLDER is simply a missing store
// entry — its id is known from the spine but its sample/media is not loaded; only
// the layout (uniform tiles) needs no data. `showItem` hydrates it on settle.
export type GridNode = ReturnType<typeof handleNode> & {
  urls?: { field: string; url: string }[];
};

export const isPlaceholder = (node: GridNode | undefined): boolean =>
  !node || !node.urls || node.urls.length === 0;

const processSamplePageData = (
  page: number,
  store: WeakMap<ID, object>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  schema: Schema,
  zoom: boolean,
  records: Map<string, number>
) => {
  if (data.samples.__typename !== "SampleItemStrConnection") {
    throw new Error(
      `unexepcted typename ${data.samples.__typename}, expected 'SampleItemStrConnection'`
    );
  }

  return data.samples.edges.map((edge, i) => {
    const node = handleNode(edge.node);
    const id = { description: node.id };

    store.set(id, node);
    records.set(node.id, page * PAGE_SIZE + i);

    return {
      key: page,
      aspectRatio: zoom
        ? zoomAspectRatio(node.sample, schema, node.aspectRatio)
        : node.aspectRatio,
      id,
      data: node as fos.Sample,
    };
  });
};

const useSpotlightPager = ({
  clearRecords,
  pageSelector,
  records,
  zoomSelector,
}: {
  clearRecords: string;
  pageSelector: RecoilValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
  >;
  records: Records;
  zoomSelector: RecoilValueReadOnly<boolean>;
}) => {
  const environment = useRelayEnvironment();
  const pager = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector);
  const handleError = useErrorHandler();
  const store: SampleStore = useMemo(() => new WeakMap(), []);
  const handleTimeout = useTimeout();

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
    };
  }, [clearRecords]);

  // The legacy GraphQL cursor pager — used by the Spotlight engine path.
  const page = useRecoilCallback(
    ({ snapshot }) => {
      return async (pageNumber: number) => {
        const variables = pager(pageNumber, PAGE_SIZE);
        let subscription: Subscription;
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
        );

        // if a page has not been requested by this callback, require a network
        // request
        const fetchPolicy = pages.has(pageNumber)
          ? "store-or-network"
          : "network-only";
        pages.add(pageNumber);

        return new Promise<Response<number, fos.Sample>>((resolve) => {
          subscription = fetchQuery<foq.paginateSamplesQuery>(
            environment,
            foq.paginateSamples,
            variables,
            {
              networkCacheConfig: { metadata: {} },
              fetchPolicy,
            }
          ).subscribe({
            next: (data) => {
              if (data.samples.__typename !== "SampleItemStrConnection") {
                resolve({
                  items: [],
                  next: null,
                  previous: null,
                });
                data.samples.__typename === "QueryTimeout" &&
                  handleTimeout(data.samples.queryTime);
                return;
              }
              const items = processSamplePageData(
                pageNumber,
                store,
                data,
                schema,
                zoom,
                records
              );
              for (const item of items) keys.current.add(item.id.description);

              resolve({
                items,
                next: data.samples.pageInfo.hasNextPage ? pageNumber + 1 : null,
                previous: pageNumber > 0 ? pageNumber - 1 : null,
              });
            },
            complete: () => {
              subscription?.unsubscribe();
            },
            error: handleError,
          });
        });
      };
    },
    [environment, handleError, handleTimeout, pager, store, zoom]
  );

  // Coalesces every visible tile's hydration request from one settled render pass
  // into a SINGLE batched read — the SAME `paginateSamples` query the grid uses,
  // narrowed to the window ids with an ordered `Select` stage, so overlays (boxes,
  // masks, video poster frames) render exactly as in the normal grid. Returns the
  // built nodes by id; the renderer writes them into `store` (it holds the IDs).
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
            (resolve) => {
              queueMicrotask(async () => {
                const ids = [...hydrate.current.ids];
                hydrate.current.ids = new Set();
                hydrate.current.promise = null;
                const out = new Map<string, GridNode>();
                if (!ids.length) return resolve(out);

                // base view variables + an ordered Select narrowing to this
                // window, so the result is the same shape as a normal grid page
                // (overlays included), in the requested id order. Read fresh so
                // the current filters/sort apply.
                const base = (await snapshot.getPromise(pageSelector))(
                  0,
                  PAGE_SIZE
                );
                const variables = {
                  ...base,
                  view: [
                    ...(((base as { view?: unknown[] }).view as unknown[]) ??
                      []),
                    {
                      _cls: "fiftyone.core.stages.Select",
                      kwargs: [
                        ["sample_ids", ids],
                        ["ordered", true],
                      ],
                    },
                  ],
                  after: null,
                  first: ids.length,
                } as VariablesOf<foq.paginateSamplesQuery>;

                let subscription: Subscription;
                subscription = fetchQuery<foq.paginateSamplesQuery>(
                  environment,
                  foq.paginateSamples,
                  variables,
                  { fetchPolicy: "network-only" }
                ).subscribe({
                  next: (data) => {
                    if (data.samples.__typename === "SampleItemStrConnection") {
                      for (const edge of data.samples.edges) {
                        const node = handleNode(edge.node) as GridNode;
                        out.set(node.id, node);
                      }
                    } else if (data.samples.__typename === "QueryTimeout") {
                      handleTimeout(data.samples.queryTime);
                    }
                    resolve(out);
                  },
                  complete: () => subscription?.unsubscribe(),
                  error: (e) => {
                    // a single window failing leaves its tiles as wireframes (they
                    // retry on the next settle) — never blow up the whole grid.
                    console.error("[infinite-grid] hydrate window failed", e);
                    resolve(out);
                  },
                });
              });
            }
          );
        }
        return hydrate.current.promise;
      },
    [environment, handleTimeout, pageSelector]
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
          for (let i = start; i < start + count; i++) {
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
              const resp = (await getFetchFunction()("POST", url, {
                spine: true,
                after: start,
              })) as SpineResponse;
              (resp?.spine ?? []).forEach((e, i) => {
                spine.byIndex.set(start + i, e);
                records.set(e.id, start + i);
              });
            })();
            spine.windowLocks.set(start, inflight);
            inflight.finally(() => spine.windowLocks.delete(start));
          }
          await inflight;
        }

        return slice();
      },
    [records, spine]
  );

  return { page, hydrateWindow, ensureSpineWindow, records, store };
};

export default useSpotlightPager;
