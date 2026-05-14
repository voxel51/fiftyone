import Flashlight, { Response } from "@fiftyone/flashlight";
import { Sample, freeVideos } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { get } from "lodash";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { selector, useRecoilValue } from "recoil";
import useFlashlightPager from "../../../../../useFlashlightPager";
import useSetDynamicGroupSample from "./useSetDynamicGroupSample";

export const DYNAMIC_GROUPS_FLASHLIGHT_CONTAINER_ID =
  "dynamic-groups-flashlight-container";
export const DYNAMIC_GROUPS_FLASHLIGHT_ELEMENT_ID =
  "dynamic-groups-flashlight-element";

/**
 * Returns a stable Flashlight render callback that manages looker lifecycle
 * for a single sample slot.
 *
 * Re-attaches or disables an existing looker when the slot is revisited, and
 * creates a new one (wiring up thumbnail-selection events) the first time a
 * sample is rendered.
 */
const useLookerRender = (
  store: fos.LookerStore<fos.Lookers>,
  createLooker: ReturnType<typeof fos.useCreateLooker>,
  selectSample: React.MutableRefObject<ReturnType<typeof fos.useSelectSample>>
) =>
  useCallback(
    (
      sampleId: string,
      element: HTMLElement,
      dimensions: [number, number],
      soft: boolean,
      hide: boolean
    ) => {
      const result = store.samples.get(sampleId);
      const looker = store.lookers.get(sampleId);

      if (looker) {
        hide ? looker.disable() : looker.attach(element, dimensions);
        return;
      }

      if (!soft && createLooker.current && result) {
        const newLooker = createLooker.current(result);
        newLooker.addEventListener(
          "selectthumbnail",
          ({ detail }: CustomEvent) => {
            selectSample.current(detail.id, detail.altKey);
          }
        );
        store.lookers.set(sampleId, newLooker);
        newLooker.attach(element, dimensions);
      }
    },
    [createLooker, selectSample, store]
  );

/**
 * Keeps all carousel lookers' display options in sync whenever selection,
 * highlight, or other looker option state changes.
 */
const useUpdateItems = (
  flashlight: Flashlight<number> | null,
  store: fos.LookerStore<fos.Lookers>,
  options: ReturnType<typeof fos.useLookerOptions>,
  highlight: (sample: fos.Sample) => boolean,
  selected: Set<string>,
  style: fos.SelectionStyle
) => {
  const updateItem = useCallback(
    async (id: string) => {
      const isSelected = selected.has(id);
      const { selectionType, selectionIcon } = fos.resolveSelectionIcon(
        selected,
        style,
        id,
        isSelected
      );
      store.lookers.get(id)?.updateOptions({
        ...options,
        selected: isSelected,
        selectionType,
        selectionIcon,
        highlight: highlight(store.samples.get(id)!.sample as Sample),
      });
    },
    [highlight, options, selected, store, style]
  );

  useEffect(() => {
    if (flashlight?.isAttached()) {
      flashlight.updateItems(updateItem);
    }
  }, [flashlight, updateItem]);
};

/**
 * Creates and configures a Flashlight instance for the dynamic groups carousel.
 *
 * Wires up looker creation, thumbnail titles (derived from the orderBy field),
 * and thumbnail selection events. Returns the factory alongside the highlight
 * predicate and looker options so the outer component can keep looker state in
 * sync with selection changes.
 */
const useCreateFlashlight = (
  page: (page: number) => Promise<Response<number>>,
  store: fos.LookerStore<fos.Lookers>
) => {
  const modalSampleId = useRecoilValue(fos.modalSampleId);
  const highlight = useCallback(
    (sample) => sample._id === modalSampleId,
    [modalSampleId]
  );
  const select = fos.useSelectSample();
  const selectSample = useRef(select);
  selectSample.current = select;
  const options = fos.useLookerOptions(true);
  const field = useRecoilValue(fos.dynamicGroupParameters);
  const setSample = useSetDynamicGroupSample();
  const createLooker = fos.useCreateLooker(
    true,
    true,
    {
      ...options,
      thumbnailTitle: (sample) =>
        field?.orderBy ? get(sample, field.orderBy) : null,
    },
    highlight
  );
  const render = useLookerRender(store, createLooker, selectSample);

  return {
    createFlashlight: useCallback(() => {
      return new Flashlight({
        horizontal: true,
        containerId: DYNAMIC_GROUPS_FLASHLIGHT_CONTAINER_ID,
        elementId: DYNAMIC_GROUPS_FLASHLIGHT_ELEMENT_ID,
        initialRequestKey: 0,
        onItemClick: (_, id) => setSample(id),
        options: {
          rowAspectRatioThreshold: 0,
        },
        get: page,
        render,
      });
    }, [page, render, setSample]),
    highlight,
    options,
  };
};

/**
 * Recoil selector that builds the paginator callback for the dynamic groups
 * carousel. Captures dataset name at selector evaluation time and reads view
 * and groupByFieldValue from a snapshot at page-fetch time so the pager always
 * uses the current view without becoming a stale closure.
 */
const pageParams = selector({
  key: "paginateDynamicGroupVariables",
  get: ({ get, getCallback }) => {
    const dataset = get(fos.datasetName);
    if (!dataset) {
      throw new Error("no dataset");
    }

    return getCallback(
      ({ snapshot }) =>
        async (page: number, pageSize: number) => {
          const params = {
            dataset,
            view: await snapshot.getPromise(fos.view),
          };
          return {
            ...params,
            dynamicGroup: await snapshot.getPromise(fos.groupByFieldValue),
            filter: {},
            after: page ? String(page * pageSize - 1) : null,
            count: pageSize,
          };
        }
    );
  },
});

/**
 * Horizontal Flashlight carousel for a dynamic group's samples.
 *
 * Recreates the Flashlight instance whenever the active group key
 * (groupByFieldValue) or selected media field changes, ensuring stale lookers
 * from a previous group are never displayed. Selection and highlight state are
 * kept in sync via a separate updateItems effect.
 */
export const DynamicGroupsFlashlightWrapper = React.memo(() => {
  const id = useId();

  const store = fos.useLookerStore();
  const { page, reset } = useFlashlightPager(store, pageParams);
  const { createFlashlight, highlight, options } = useCreateFlashlight(
    page,
    store
  );

  const key = fos.useGroupByFieldValue();
  const lastIdentity = useRef<string | undefined>(undefined);
  const [flashlight, setFlashlight] = useState<Flashlight<number> | null>(null);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  useEffect(() => {
    if (key === undefined) return;
    const identity = `${mediaField}::${key ?? "null"}`;
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    reset();
    setFlashlight(createFlashlight());
  }, [createFlashlight, key, reset, mediaField]);

  useEffect(() => {
    if (flashlight && !flashlight.isAttached()) {
      flashlight.attach(id);
      return () => {
        flashlight.detach();
        freeVideos();
      };
    }
  }, [flashlight, id]);

  const selected = useRecoilValue(fos.selectedSamples);
  const style = useRecoilValue(fos.sampleSelectionStyle);
  useUpdateItems(flashlight, store, options, highlight, selected, style);

  return (
    <div
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        position: "relative",
      }}
      id={id}
    />
  );
});
