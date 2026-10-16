import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import {
  resolveGridLocation,
  type SelectionRequest,
  useGridSelectionBoundary,
  useGridSelectionDataset,
  useGridSelectionPagingError,
  type GridSampleNode,
} from "@fiftyone/state/src/selection";
import { useCallback, useEffect, useMemo } from "react";
import { useErrorHandler } from "react-error-boundary";
import type { VariablesOf } from "react-relay";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import type { Subscription } from "relay-runtime";
import type { Records } from "./useRecords";
import useTimeout from "./useTimeout";
import { handleNode } from "./utils";
import { PAGE_SIZE } from "./constants";
import BoundedMap from "./BoundedMap";
import { GridNavigation } from "./GridNavigation";

export type SampleStore = WeakMap<ID, fos.Sample>;

class GridQueryTimeout extends Error {}

const useSpotlightPager = ({
  clearRecords,
  scopeKey,
  pageSelector,
  records,
  resetLocation,
  zoomSelector,
}: {
  clearRecords: string;
  scopeKey: string;
  pageSelector: RecoilValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
  >;
  records: Records;
  resetLocation: () => void;
  zoomSelector: RecoilValueReadOnly<boolean>;
}) => {
  const environment = useRelayEnvironment();
  const pager = useRecoilValue(pageSelector);
  // An extension's ranges name its matched samples, which its extended stage
  // already selects; as a page boundary they would also drop a grouped
  // dataset's tile whose group matched through another slice
  const [boundary] = useGridSelectionBoundary({ rangeConstraint: false });
  const { enabled: selectionEnabled, datasetId: selectionDatasetId } =
    useGridSelectionDataset();
  const reportSelectionError = useGridSelectionPagingError();
  const zoom = useRecoilValue(zoomSelector);
  const handleError = useErrorHandler();
  const store: SampleStore = useMemo(() => new WeakMap(), []);
  const handleTimeout = useTimeout();
  const navigation = useMemo(() => {
    scopeKey;
    return new GridNavigation();
  }, [scopeKey]);
  const lifetime = useMemo(() => {
    clearRecords;
    return { controller: new AbortController() };
  }, [clearRecords]);
  // Retire requests owned by the grid being replaced.
  useEffect(() => {
    // React can replay effect setup after cleanup in Strict Mode.
    if (lifetime.controller.signal.aborted)
      lifetime.controller = new AbortController();
    return () => lifetime.controller.abort();
  }, [lifetime]);

  const { pages, previews } = useMemo(() => {
    // Share loaded nodes without keeping evicted grid pages alive.
    clearRecords;
    return {
      pages: new BoundedMap<number, true>(512),
      previews: new BoundedMap<string, WeakRef<GridSampleNode>>(1_000),
    };
  }, [clearRecords]);
  const getPreview = useCallback(
    (sampleId: string) => previews.get(sampleId)?.deref(),
    [previews],
  );

  const fetchOffset = useCallback(
    async (pageNumber: number, signal: AbortSignal, locating = false) => {
      signal.throwIfAborted();
      const variables = pager(pageNumber, PAGE_SIZE);
      if (selectionEnabled)
        variables.filters = {
          ...variables.filters,
          _selection_scope: boundary,
        };
      if (locating) variables.maxQueryTime = 5;
      const fetchPolicy = pages.has(pageNumber)
        ? "store-or-network"
        : "network-only";
      return new Promise<{
        nodes: readonly foq.PaginateSamplesNode[];
        more: boolean;
      }>((resolve, reject) => {
        const subscription: { current?: Subscription } = {};
        const abort = () => {
          subscription.current?.unsubscribe();
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        subscription.current = fetchQuery<foq.paginateSamplesQuery>(
          environment,
          foq.paginateSamples,
          variables,
          {
            networkCacheConfig: { metadata: {} },
            fetchPolicy,
          },
        ).subscribe({
          next: (data) => {
            if (signal.aborted) return;
            if (data.samples.__typename !== "SampleItemStrConnection") {
              if (!locating && data.samples.__typename === "QueryTimeout")
                handleTimeout(data.samples.queryTime);
              reject(
                new GridQueryTimeout(
                  "The grid query took too long. Try again.",
                ),
              );
              return;
            }
            pages.set(pageNumber, true);
            resolve({
              nodes: data.samples.edges
                .map((edge) => edge.node)
                .filter(
                  (node): node is foq.PaginateSamplesNode =>
                    node.__typename !== "%other",
                ),
              more: data.samples.pageInfo.hasNextPage,
            });
          },
          complete: () => {
            signal.removeEventListener("abort", abort);
          },
          error: (error: Error) => {
            signal.removeEventListener("abort", abort);
            reject(error);
          },
        });
      });
    },
    [pager, selectionEnabled, boundary, pages, environment, handleTimeout],
  );

  const prepare = useCallback(
    async (
      datasetId: string,
      request: SelectionRequest,
      sampleId: string,
      signal: AbortSignal,
    ) => {
      const gridRequest = { ...request, boundary };
      const location = await resolveGridLocation(
        datasetId,
        { ...gridRequest, sampleId, direction: "at" },
        signal,
      );
      signal.throwIfAborted();
      if (location.kind === "missing") return null;
      const pageNumber =
        location.kind === "seek" ? 0 : Math.floor(location.index / PAGE_SIZE);
      const result =
        location.kind === "seek"
          ? { nodes: location.nodes, more: Boolean(location.next) }
          : await fetchOffset(pageNumber, signal, true);
      signal.throwIfAborted();
      if (!result.nodes.some((node) => node.id === sampleId))
        throw new Error(
          "The grid results changed. Try showing the item again.",
        );
      return {
        page: pageNumber,
        commit: () => {
          signal.throwIfAborted();
          // Stop the outgoing grid before replacing its relative page space.
          lifetime.controller.abort();
          if (location.kind === "seek" || navigation.active) records.clear();
          navigation.start(
            pageNumber,
            result.nodes,
            location.kind === "seek" ? location : undefined,
            result.more,
          );
          navigation.request = gridRequest;
        },
      };
    },
    [fetchOffset, navigation, records, boundary, lifetime],
  );

  const page = useRecoilCallback(
    ({ snapshot }) =>
      async (
        pageNumber: number,
        gridKey?: string,
      ): Promise<Response<number, fos.Sample>> => {
        const revision = navigation.revision;
        const empty = { items: [], previous: null, next: null };
        // The outgoing Spotlight can call the latest pager through Grid's
        // ref before it is destroyed. It must not consume the new window.
        if (gridKey !== undefined && gridKey !== clearRecords) return empty;
        const signal = lifetime.controller.signal;
        try {
          signal.throwIfAborted();
          const schema = await snapshot.getPromise(
            fos.fieldSchema({ space: fos.State.SPACE.SAMPLE }),
          );
          signal.throwIfAborted();
          if (revision !== navigation.revision) return empty;
          const recover = () => {
            // Range loading has no authority to move the user's viewport.
            if (gridKey === undefined)
              throw new Error(
                "This grid location expired. Show the item again.",
              );
            lifetime.controller.abort();
            navigation.reset();
            records.clear();
            resetLocation();
            return empty;
          };
          const seed = navigation.takeSeed(pageNumber);
          let nodes: readonly foq.PaginateSamplesNode[];
          let next: number | null;
          let previous: number | null;
          if (seed) {
            ({ nodes, next, previous } = seed);
          } else if (navigation.active) {
            const cursor = navigation.cursor(pageNumber);
            if (!cursor) return recover();
            const location = await resolveGridLocation(
              selectionDatasetId,
              { ...navigation.request!, ...cursor },
              signal,
            );
            signal.throwIfAborted();
            if (revision !== navigation.revision) return empty;
            // A deleted/filtered anchor or an evicted bookmark must not
            // strand the refreshed grid with no pages in either direction.
            if (location.kind !== "seek") return recover();
            nodes = location.nodes;
            ({ next, previous } = navigation.remember(pageNumber, location));
          } else {
            const result = await fetchOffset(pageNumber, signal);
            nodes = result.nodes;
            next = result.more ? pageNumber + 1 : null;
            previous = pageNumber > 0 ? pageNumber - 1 : null;
          }
          signal.throwIfAborted();
          if (revision !== navigation.revision) return empty;
          const start =
            pageNumber * PAGE_SIZE +
            (navigation.active && pageNumber < 0
              ? PAGE_SIZE - nodes.length
              : 0);
          const items = nodes.map((raw, index) => {
            const node = handleNode(raw);
            const id = { description: node.id };
            store.set(id, node);
            records.set(node.id, start + index);
            previews.set(node.id, new WeakRef(node));
            return {
              key: pageNumber,
              aspectRatio: zoom
                ? zoomAspectRatio(node.sample, schema, node.aspectRatio)
                : node.aspectRatio,
              id,
              data: node as fos.Sample,
            };
          });
          return { items, next, previous };
        } catch (error) {
          if (signal.aborted || revision !== navigation.revision) return empty;
          // Normal paging already reported this through the performance UI.
          // Locate requests reject separately, leaving their control retryable.
          if (error instanceof GridQueryTimeout) return empty;
          if (
            navigation.active ||
            (selectionEnabled && (boundary.subsetId || boundary.provider))
          )
            reportSelectionError(error);
          else handleError(error);
          return empty;
        }
      },
    [
      navigation,
      lifetime,
      clearRecords,
      pager,
      selectionDatasetId,
      store,
      records,
      resetLocation,
      previews,
      zoom,
      fetchOffset,
      selectionEnabled,
      boundary,
      reportSelectionError,
      handleError,
    ],
  );

  return { page, records, store, getPreview, prepare };
};

export default useSpotlightPager;
