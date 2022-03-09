import React, {
  useLayoutEffect,
  useRef,
  useState,
  MutableRefObject,
} from "react";
import { useErrorHandler } from "react-error-boundary";
import {
  atom,
  RecoilState,
  selector,
  Snapshot,
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import Flashlight, { FlashlightOptions } from "@fiftyone/flashlight";
import { FrameLooker, freeVideos, zoomAspectRatio } from "@fiftyone/looker";
import {
  EMBEDDED_DOCUMENT_FIELD,
  getFetchFunction,
  LIST_FIELD,
  toSnakeCase,
} from "@fiftyone/utilities";

import * as atoms from "../recoil/atoms";
import * as colorAtoms from "../recoil/color";
import * as filterAtoms from "../recoil/filters";
import * as schemaAtoms from "../recoil/schema";
import * as selectors from "../recoil/selectors";
import { State } from "../recoil/types";
import * as viewAtoms from "../recoil/view";
import { getSampleSrc, lookerType, useClearModal } from "../recoil/utils";
import { getMimeType } from "../utils/generic";
import { filterView } from "../utils/view";
import socket, { http } from "../shared/connection";
import { useEventHandler, useSelect } from "../utils/hooks";
import { pathFilter } from "./Filters";
import { sidebarGroupsDefinition, textFilter } from "./Sidebar";
import { gridZoom } from "./ImageContainerHeader";
import { store } from "./Flashlight.store";
import { similarityParameters } from "./Actions/Similar";

const setModal = async (
  snapshot: Snapshot,
  set: <T>(
    recoilVal: RecoilState<T>,
    valOrUpdater: T | ((currVal: T) => T)
  ) => void
) => {
  const data = [
    [filterAtoms.modalFilters, filterAtoms.filters],
    [atoms.colorByLabel(true), atoms.colorByLabel(false)],
    [
      schemaAtoms.activeFields({ modal: true }),
      schemaAtoms.activeFields({ modal: false }),
    ],
    [atoms.cropToContent(true), atoms.cropToContent(false)],
    [atoms.colorSeed(true), atoms.colorSeed(false)],
    [atoms.sortFilterResults(true), atoms.sortFilterResults(false)],
    [atoms.alpha(true), atoms.alpha(false)],
    [sidebarGroupsDefinition(true), sidebarGroupsDefinition(false)],
    [atoms.sidebarWidth(true), atoms.sidebarWidth(false)],
    [atoms.sidebarVisible(true), atoms.sidebarVisible(false)],
    [textFilter(true), textFilter(false)],
  ];

  const results = await Promise.all(
    data.map(([_, get]) => snapshot.getPromise(get as RecoilState<any>))
  );

  for (const i in results) {
    set(data[i][0], results[i]);
  }
};

export const gridZoomRange = atom<[number, number]>({
  key: "gridZoomRange",
  default: [0, 10],
});

let nextIndex = 0;

const url = `${http}/samples`;

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: block;
  position: relative;
`;

const flashlightOptions = selector<FlashlightOptions>({
  key: "flashlightOptions",
  get: ({ get }) => {
    return {
      rowAspectRatioThreshold:
        11 - Math.max(get(gridZoom), get(gridZoomRange)[0]),
    };
  },
});

const flashlightLookerOptions = selector({
  key: "flashlightLookerOptions",
  get: ({ get }) => {
    return {
      coloring: get(colorAtoms.coloring(false)),
      filter: get(pathFilter(false)),
      activePaths: get(schemaAtoms.activeFields({ modal: false })),
      zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(false)),
      loop: true,
      inSelectionMode: get(atoms.selectedSamples).size > 0,
      timeZone: get(selectors.timeZone),
      alpha: get(atoms.alpha(false)),
      disabled: false,
      imageFilters: Object.fromEntries(
        Object.keys(atoms.IMAGE_FILTERS).map((filter) => [
          filter,
          get(atoms.imageFilters({ modal: false, filter })),
        ])
      ),
    };
  },
});

const stringifyObj = (obj) => {
  if (typeof obj !== "object" || Array.isArray(obj)) return obj;
  return JSON.stringify(
    Object.keys(obj)
      .map((key) => {
        return [key, obj[key]];
      })
      .sort((a, b) => a[0] - b[0])
  );
};

const argFact = (compareFn) => (array) =>
  array.map((el, idx) => [el, idx]).reduce(compareFn)[1];

const argMin = argFact((max, el) => (el[0] < max[0] ? el : max));

const useThumbnailClick = (
  flashlight: MutableRefObject<Flashlight<number>>
) => {
  const clearModal = useClearModal();

  return useRecoilCallback(
    ({ set, snapshot }) => async (
      event: MouseEvent,
      sampleId: string,
      itemIndexMap: { [key: string]: number }
    ) => {
      const clickedIndex = itemIndexMap[sampleId];
      const reverse = Object.fromEntries(
        Object.entries(itemIndexMap).map(([k, v]) => [v, k])
      );
      let selected = new Set(await snapshot.getPromise(atoms.selectedSamples));
      const groups = await snapshot.getPromise(sidebarGroupsDefinition(false));
      set(sidebarGroupsDefinition(true), groups);
      const openModal = () => {
        const getIndex = (index) => {
          const promise = store.indices.has(index)
            ? Promise.resolve(store.samples.get(store.indices.get(index)))
            : flashlight.current.get()?.then(() => {
                return store.indices.has(index)
                  ? store.samples.get(store.indices.get(index))
                  : null;
              });

          promise
            ? promise.then((sample) => {
                sample
                  ? set(atoms.modal, { ...sample, index, getIndex })
                  : clearModal();
              })
            : clearModal();
        };
        set(atoms.modal, {
          ...store.samples.get(sampleId),
          index: clickedIndex,
          getIndex,
        });
        setModal(snapshot, set);
      };

      const addRange = () => {
        const closeIndex =
          itemIndexMap[
            array[
              argMin(
                array.map((id) => Math.abs(itemIndexMap[id] - clickedIndex))
              )
            ]
          ];

        const [start, end] =
          clickedIndex < closeIndex
            ? [clickedIndex, closeIndex]
            : [closeIndex, clickedIndex];

        const added = new Array(end - start + 1)
          .fill(0)
          .map((_, i) => reverse[i + start]);

        selected = new Set([...array, ...added]);
      };

      const removeRange = () => {
        let before = clickedIndex;
        while (selected.has(reverse[before])) {
          before--;
        }
        before += 1;

        let after = clickedIndex;
        while (selected.has(reverse[after])) {
          after++;
        }
        after -= 1;

        const [start, end] =
          clickedIndex - before <= after - clickedIndex
            ? clickedIndex - before === 0
              ? [clickedIndex, after]
              : [before, clickedIndex]
            : after - clickedIndex === 0
            ? [before, clickedIndex]
            : [clickedIndex, after];

        selected = new Set(
          array.filter((s) => itemIndexMap[s] < start || itemIndexMap[s] > end)
        );
      };

      const selectedopen = selected.size > 0 && event.type === "contextmenu";
      if (selectedopen) {
        event.preventDefault();
      }
      if (!selected.size || selectedopen) {
        openModal();
        return;
      }

      const array = [...selected];
      if (event.shiftKey && !selected.has(sampleId)) {
        addRange();
      } else if (event.shiftKey) {
        removeRange();
      } else {
        selected.has(sampleId)
          ? selected.delete(sampleId)
          : selected.add(sampleId);
      }

      set(atoms.selectedSamples, selected);
      socket.send(
        packageMessage("set_selection", { _ids: Array.from(selected) })
      );
    },
    []
  );
};

interface PageParameters {
  filters: State.Filters;
  dataset: string;
  view: State.Stage[];
}

const pageParameters = selector<PageParameters>({
  key: "pageParameters",
  get: ({ get }) => {
    const similarity = get(similarityParameters);
    return {
      filters: get(filterAtoms.filters),
      view: get(viewAtoms.view),
      dataset: get(selectors.datasetName),
      similarity: similarity ? toSnakeCase(similarity) : null,
    };
  },
});

export default React.memo(() => {
  const [id] = useState(() => uuid());
  const options = useRecoilValue(flashlightOptions);
  const lookerOptions = useRecoilValueLoadable(flashlightLookerOptions);
  const getLookerType = useRecoilValue(lookerType);
  const lookerGeneratorRef = useRef<any>();
  const isClips = useRecoilValue(viewAtoms.isClipsView);
  const fieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE, filtered: true })
  );
  const frameFieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.FRAME, filtered: true })
  );
  const flashlight = useRef<Flashlight<number>>();
  const cropToContent = useRecoilValue(atoms.cropToContent(false));
  const filters = useRecoilValue(filterAtoms.filters);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(viewAtoms.view);
  const refresh = useRecoilValue(selectors.refresh);
  const selected = useRecoilValue(atoms.selectedSamples);
  const onThumbnailClick = useThumbnailClick(flashlight);
  const onSelect = useSelect();
  const params = useRecoilValue(pageParameters);
  const paramsRef = useRef(params);

  paramsRef.current = params;
  const setGridZoomRange = useSetRecoilState(gridZoomRange);
  const handleError = useErrorHandler();
  const gridZoomRef = useRef<number>();
  const gridZoomValue = useRecoilValue(gridZoom);
  gridZoomRef.current = gridZoomValue;
  const taggingLabels = useRecoilValue(
    atoms.tagging({ modal: false, labels: true })
  );
  const dataset = useRecoilValue(selectors.datasetName);

  const taggingSamples = useRecoilValue(
    atoms.tagging({ modal: false, labels: false })
  );
  const tagging = taggingLabels || taggingSamples;
  lookerGeneratorRef.current = ({
    sample,
    dimensions,
    frameNumber,
    frameRate,
    url,
  }: atoms.SampleData) => {
    const constructor = getLookerType(getMimeType(sample));
    const etc = isClips ? { support: sample.support } : {};
    const config = {
      src: getSampleSrc(sample.filepath, sample._id, url),
      thumbnail: true,
      dimensions,
      sampleId: sample._id,
      frameRate,
      dataset,
      view,
      frameNumber: constructor === FrameLooker ? frameNumber : null,
      fieldSchema: {
        ...fieldSchema,
        frames: {
          name: "frames",
          ftype: LIST_FIELD,
          subfield: EMBEDDED_DOCUMENT_FIELD,
          embeddedDocType: "fiftyone.core.frames.FrameSample",
          fields: frameFieldSchema,
        },
      },
      ...etc,
    };

    const looker = new constructor(sample, config, {
      ...lookerOptions.contents,
      selected: selected.has(sample._id),
    });
    looker.addEventListener("error", (event: ErrorEvent) => {
      handleError(event.error);
    });

    return looker;
  };
  const aspectRatioGenerator = useRef<any>();
  aspectRatioGenerator.current = ({
    sample,
    dimensions: [width, height],
  }: atoms.SampleData) => {
    const aspectRatio = width / height;
    return lookerOptions.contents.zoom
      ? zoomAspectRatio(sample, aspectRatio)
      : aspectRatio;
  };

  useEventHandler(
    document,
    "keydown",
    useRecoilCallback(
      ({ snapshot, set }) => async (event: KeyboardEvent) => {
        if (event.key !== "Escape") {
          return;
        }

        const modal = await snapshot.getPromise(atoms.modal);

        if (!modal) {
          set(atoms.selectedSamples, new Set());
          socket.send(packageMessage("set_selection", { _ids: [] }));
        }
      },
      []
    )
  );

  useLayoutEffect(() => {
    if (!flashlight.current || !flashlight.current.isAttached() || tagging) {
      return;
    }

    store.reset();
    freeVideos();
    nextIndex = 0;
    flashlight.current.reset();
  }, [
    flashlight,
    stringifyObj(filters),
    datasetName,
    filterView(view),
    refresh,
    cropToContent,
    tagging,
    useRecoilValue(pageParameters),
  ]);

  useLayoutEffect(() => {
    if (!flashlight.current) {
      flashlight.current = new Flashlight<number>({
        initialRequestKey: 1,
        options,
        onItemClick: onThumbnailClick,
        onResize: (width) => {
          let min = 7;

          if (width >= 1200) {
            min = 0;
          } else if (width >= 1000) {
            min = 2;
          } else if (width >= 800) {
            min = 4;
          }

          const newZoom = Math.max(min, gridZoomRef.current);
          setGridZoomRange([min, 10]);
          return {
            rowAspectRatioThreshold: 11 - newZoom,
          };
        },
        onItemResize: (id, dimensions) => {
          store.lookers.has(id) && store.lookers.get(id).resize(dimensions);
        },
        get: async (page) => {
          try {
            const { results, more } = await getFetchFunction()(
              "POST",
              "/samples",
              { ...paramsRef.current, page }
            );
            const itemData = results.map((result) => {
              const data: atoms.SampleData = {
                sample: result.sample,
                dimensions: [result.width, result.height],
                frameRate: result.frame_rate,
                frameNumber: result.sample.frame_number,
                url: result.url,
              };
              store.samples.set(result.sample._id, data);
              store.indices.set(nextIndex, result.sample._id);
              nextIndex++;

              return data;
            });

            const items = itemData.map((data) => {
              return {
                id: data.sample._id,
                aspectRatio: aspectRatioGenerator.current(data),
              };
            });

            return {
              items,
              nextRequestKey: more ? page + 1 : null,
            };
          } catch (error) {
            handleError(error);
          }
        },
        render: (sampleId, element, dimensions, soft, hide) => {
          try {
            const result = store.samples.get(sampleId);

            if (store.lookers.has(sampleId)) {
              const looker = store.lookers.get(sampleId);
              hide ? looker.disable() : looker.attach(element, dimensions);

              return;
            }

            if (!soft) {
              const looker = lookerGeneratorRef.current(result);
              looker.addEventListener(
                "selectthumbnail",
                ({ detail }: { detail: string }) => onSelect(detail)
              );

              store.lookers.set(sampleId, looker);
              looker.attach(element, dimensions);
            }
          } catch (error) {
            handleError(error);
          }
        },
      });
      flashlight.current.attach(id);
    } else {
      flashlight.current.updateOptions(options);
      flashlight.current.updateItems((sampleId) => {
        const looker = store.lookers.get(sampleId);
        looker &&
          looker.updateOptions({
            ...lookerOptions.contents,
            selected: selected.has(sampleId),
            inSelectionMode: selected.size > 0,
          });
      });
    }
  }, [id, options, lookerOptions, selected, gridZoomRef]);

  return <Container id={id}></Container>;
});
