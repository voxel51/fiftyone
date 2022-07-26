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
  selectorFamily,
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
import {
  useEventHandler,
  useSelectSample,
  useSetSelected,
} from "../utils/hooks";
import { pathFilter } from "./Filters";
import { sidebarGroupsDefinition, textFilter } from "./Sidebar";
import { gridZoom } from "./ImageContainerHeader";
import { store } from "./Flashlight.store";
import { similarityParameters } from "./Actions/Similar";
import { skeletonFilter } from "./Filters/utils";

const setModal = async (
  snapshot: Snapshot,
  set: <T>(
    recoilVal: RecoilState<T>,
    valOrUpdater: T | ((currVal: T) => T)
  ) => void
) => {
  const data = [
    [filterAtoms.modalFilters, filterAtoms.filters],
    ...["colorBy", "multicolorKeypoints", "showSkeletons"].map((key) => {
      return [
        selectors.appConfigOption({ key, modal: true }),
        selectors.appConfigOption({ key, modal: false }),
      ];
    }),
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

const flashlightLookerOptions = selectorFamily<any, boolean>({
  key: "flashlightLookerOptions",
  get:
    (withFilter) =>
    ({ get }) => {
      return {
        coloring: get(colorAtoms.coloring(false)),
        filter: withFilter ? get(pathFilter(false)) : null,
        activePaths: get(schemaAtoms.activeFields({ modal: false })),
        zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(false)),
        loop: true,
        timeZone: get(selectors.timeZone),
        alpha: get(atoms.alpha(false)),
        showSkeletons: get(
          selectors.appConfigOption({ key: "showSkeletons", modal: false })
        ),
        defaultSkeleton: get(atoms.dataset).defaultSkeleton,
        skeletons: Object.fromEntries(
          get(atoms.dataset)?.skeletons.map(({ name, ...rest }) => [name, rest])
        ),
        pointFilter: get(skeletonFilter(false)),
      };
    },
});

const useLookerOptions = () => {
  const loaded = useRecoilValueLoadable(flashlightLookerOptions(true));

  const loading = useRecoilValue(flashlightLookerOptions(false));
  return loaded.contents instanceof Promise ? loading : loaded.contents;
};

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
  const setSelected = useSetSelected();

  return useRecoilCallback(
    ({ set, snapshot }) =>
      async ({
        shiftKey,
        sampleId,
      }: {
        shiftKey: boolean;
        sampleId: string;
      }) => {
        const itemIndexMap = flashlight.current.itemIndexes;
        const clickedIndex = itemIndexMap[sampleId];
        const reverse = Object.fromEntries(
          Object.entries(itemIndexMap).map(([k, v]) => [v, k])
        );
        let selected = new Set(
          await snapshot.getPromise(atoms.selectedSamples)
        );
        const groups = await snapshot.getPromise(
          sidebarGroupsDefinition(false)
        );
        set(sidebarGroupsDefinition(true), groups);

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
            array.filter(
              (s) => itemIndexMap[s] < start || itemIndexMap[s] > end
            )
          );
        };

        const array = [...selected];
        if (shiftKey && !selected.has(sampleId)) {
          addRange();
        } else if (shiftKey) {
          removeRange();
        } else {
          selected.has(sampleId)
            ? selected.delete(sampleId)
            : selected.add(sampleId);
        }

        set(atoms.selectedSamples, selected);
        setSelected([...selected]);
      },
    []
  );
};

const useOpenModal = (flashlight: MutableRefObject<Flashlight<number>>) => {
  const clearModal = useClearModal();
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (
        event: MouseEvent,
        sampleId: string,
        itemIndexMap: { [key: string]: number }
      ) => {
        const clickedIndex = itemIndexMap[sampleId];
        const groups = await snapshot.getPromise(
          sidebarGroupsDefinition(false)
        );
        set(sidebarGroupsDefinition(true), groups);

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
      }
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
  const lookerOptions = useLookerOptions();
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
  const selected = useRecoilValue(atoms.selectedSamples);
  const onThumbnailClick = useOpenModal(flashlight);
  const onSelect = useThumbnailClick(flashlight);
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
  const selectedMediaField = useRecoilValue(atoms.selectedMediaField);
  const selectedMediaFieldName = selectedMediaField.grid || "filepath";

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
      src: getSampleSrc(sample[selectedMediaFieldName], sample._id, url),
      thumbnail: true,
      dimensions,
      sampleId: sample._id,
      frameRate,
      dataset: datasetName,
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
      ...lookerOptions,
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
    return lookerOptions.zoom
      ? zoomAspectRatio(sample, aspectRatio)
      : aspectRatio;
  };

  useEventHandler(
    document,
    "keydown",
    useRecoilCallback(
      ({ snapshot, set }) =>
        async (event: KeyboardEvent) => {
          if (event.key !== "Escape") {
            return;
          }

          const modal = await snapshot.getPromise(atoms.modal);

          if (!modal) {
            set(atoms.selectedSamples, new Set());
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
    cropToContent,
    tagging,
    useRecoilValue(pageParameters),
    useRecoilValue(atoms.refresher),
    selectedMediaFieldName,
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
            ...lookerOptions,
            selected: selected.has(sampleId),
          });
      });
    }
  }, [id, options, lookerOptions, selected, gridZoomRef]);

  return <Container id={id}></Container>;
});
