/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Builds the shared {@link Strips} value for a Lanes or Matrix layout: one
 * looker cache, sample store, and base renderer for all of its inner
 * instances, with looker option updates fanned out to each of them.
 */

import type { Updater } from "@fiftyone/floodlight";
import type * as foq from "@fiftyone/relay";
import { useReverbValue } from "@fiftyone/reverb";
import { useSyncLabelsRenderingStatus } from "@fiftyone/core/src/hooks";
import { useCallback, useMemo, useRef } from "react";
import type { VariablesOf } from "react-relay";
import { useRelayEnvironment } from "react-relay";
import {
  gridSpacing,
  gridSquareTiles,
  maxGridItemsSizeBytes,
  pageParameters,
} from "../atoms";
import { type FieldValue, useMatchStage } from "../categorical";
import { createLimiter } from "../samplePages";
import { createOwnership } from "../../host/ownership";
import useItemCache from "../useItemCache";
import useLabelVisibility from "../useLabelVisibility";
import useRecords from "../useRecords";
import useRefreshers from "../useRefreshers";
import useRenderer from "../useRenderer";
import type { SampleStore } from "../useSpotlightPager";
import useUpdates from "../useUpdates";
import type { Strips, Updatable } from "./context";

const MAX_HIDDEN = 200;
const MAX_CONCURRENT_PAGES = 4;

type Vars = VariablesOf<foq.paginateSamplesQuery>;

const useFanout = () =>
  useMemo(() => {
    const instances = new Set<Updatable>();
    let last: Updater | undefined;

    return {
      register: (spotlight: Updatable) => {
        last && spotlight.updateItems(last);
        instances.add(spotlight);
        return () => {
          instances.delete(spotlight);
        };
      },
      updateItems: (updater: Updater) => {
        last = updater;
        for (const instance of instances) instance.updateItems(updater);
      },
    };
  }, []);

const useVariables = () => {
  const page = useReverbValue(pageParameters);
  const match = useMatchStage();

  return useCallback(
    (matches: [string, FieldValue][]) => {
      const stages = matches.map(([path, value]) => match(path, value));
      return (index: number, pageSize: number) => {
        // strips page by index; a committed scrub cursor belongs to the grid
        const { cursorPagination: _, ...vars } = page(index, pageSize) as {
          cursorPagination?: boolean;
          view: unknown[];
        };
        return {
          ...vars,
          view: [...vars.view, ...stages],
          after: index ? String(index * pageSize - 1) : null,
        } as unknown as Vars;
      };
    },
    [match, page],
  );
};

export default function useStrips(id: string, root: HTMLElement | null) {
  const { reset } = useRefreshers();
  useSyncLabelsRenderingStatus();

  const maxBytes = useReverbValue(maxGridItemsSizeBytes) / 2;
  const cache = useItemCache({
    maxHiddenItems: MAX_HIDDEN,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    ...useLabelVisibility(),
  });
  const records = useRecords(reset);
  const ownership = useMemo(() => createOwnership(), []);
  const lastSizes = useMemo(() => {
    reset;
    return new Map<string, [number, number]>();
  }, [reset]);
  const hasItem = useCallback(
    (key: string) => cache.get(key) !== undefined,
    [cache],
  );
  const store: SampleStore = useMemo(() => {
    reset;
    return new WeakMap();
  }, [reset]);

  const base = useRenderer({ cache, id, records, store });
  const renderer = useRef(base.renderer);
  renderer.current = base.renderer;

  const fanout = useFanout();
  useUpdates({
    cache,
    getFontSize: base.getFontSize,
    options: base.lookerOptions,
    spotlight: fanout,
  });

  const environment = useRelayEnvironment();
  const limit = useMemo(() => createLimiter(MAX_CONCURRENT_PAGES), []);
  const spacing = useReverbValue(gridSpacing);
  const square = useReverbValue(gridSquareTiles);
  const variables = useVariables();

  return useMemo<Strips>(
    () => ({
      aspectRatio: square ? 1 : undefined,
      cache,
      environment,
      hasItem,
      lastSizes,
      limit,
      ownership,
      records,
      register: fanout.register,
      renderer,
      reset,
      root,
      spacing,
      store,
      variables,
    }),
    [
      cache,
      environment,
      fanout,
      hasItem,
      lastSizes,
      limit,
      ownership,
      records,
      reset,
      root,
      spacing,
      square,
      store,
      variables,
    ],
  );
}
