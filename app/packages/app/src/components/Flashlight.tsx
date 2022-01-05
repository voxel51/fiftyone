import LRU from "lru-cache";
import React, {
  useLayoutEffect,
  useRef,
  useState,
  MutableRefObject,
} from "react";
import {
  atom,
  RecoilState,
  selector,
  Snapshot,
  useRecoilCallback,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import Flashlight, { FlashlightOptions } from "@fiftyone/flashlight";
import {
  FrameLooker,
  freeVideos,
  ImageLooker,
  VideoLooker,
  zoomAspectRatio,
} from "@fiftyone/looker";

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
import { packageMessage } from "../utils/socket";
import socket, { http } from "../shared/connection";
import { useEventHandler, useMessageHandler } from "../utils/hooks";
import { pathFilter } from "./Filters";
import { sidebarEntries, sidebarGroupsDefinition } from "./Sidebar";
import { gridZoom } from "./ImageContainerHeader";
import { useErrorHandler } from "react-error-boundary";
import { EMBEDDED_DOCUMENT_FIELD, LIST_FIELD } from "@fiftyone/utilities";

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
    [
      sidebarEntries({ modal: true, loadingTags: false }),
      sidebarEntries({ modal: false, loadingTags: false }),
    ],
    [atoms.sidebarWidth(true), atoms.sidebarWidth(false)],
    [atoms.sidebarVisible(true), atoms.sidebarVisible(false)],
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

type Lookers = FrameLooker | ImageLooker | VideoLooker;

const createLookerCache = <L extends Lookers>() => {
  return new LRU<string, L>({
    max: 500,
    dispose: (id, looker) => looker.destroy(),
  });
};

export let samples = new Map<string, atoms.SampleData>();
export let sampleIndices = new Map<number, string>();
let nextIndex = 0;
let lookers = createLookerCache();

const url = `${http}/page`;

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
      filter: (path: string, value) => {
        return get(pathFilter({ modal: false, path }))(value);
      },
      activePaths: get(schemaAtoms.activeFields({ modal: false })),
      zoom: get(viewAtoms.isPatchesView) && get(atoms.cropToContent(false)),
      loop: true,
      inSelectionMode: get(atoms.selectedSamples).size > 0,
      timeZone: get(selectors.timeZone),
      alpha: get(atoms.alpha(false)),
      disabled: false,
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
          const promise = sampleIndices.has(index)
            ? Promise.resolve(samples.get(sampleIndices.get(index)))
            : flashlight.current.get()?.then(() => {
                return sampleIndices.has(index)
                  ? samples.get(sampleIndices.get(index))
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
          ...samples.get(sampleId),
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

      if (!selected.size) {
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

const useSelect = () => {
  return useRecoilCallback(
    ({ set, snapshot }) => async (sampleId: string) => {
      const selected = new Set(
        await snapshot.getPromise(atoms.selectedSamples)
      );
      selected.has(sampleId)
        ? selected.delete(sampleId)
        : selected.add(sampleId);
      set(atoms.selectedSamples, selected);
      socket.send(
        packageMessage("set_selection", { _ids: Array.from(selected) })
      );
    },
    []
  );
};

export const useSampleUpdate = () => {
  const handler = useRecoilCallback(
    ({ set, snapshot }) => async ({ samples: updatedSamples }) => {
      updatedSamples.forEach((sample) => {
        samples.set(sample._id, { ...samples.get(sample._id), sample });
        lookers.has(sample._id) && lookers.get(sample._id).updateSample(sample);
      });
      set(atoms.modal, { ...(await snapshot.getPromise(atoms.modal)) });
      set(selectors.anyTagging, false);
    },
    []
  );
  useMessageHandler("samples_update", handler);
};

interface PageParameters {
  filters: State.Filters;
  dataset: string;
  view: State.Stage[];
}

const pageParameters = selector<PageParameters>({
  key: "pageParameters",
  get: ({ get }) => {
    return {
      filters: get(filterAtoms.filters),
      view: get(viewAtoms.view),
      dataset: get(selectors.datasetName),
    };
  },
});

const getPageParameters = selector<() => Promise<PageParameters>>({
  key: "getPageParameters",
  get: ({ getCallback }) => {
    return getCallback(({ snapshot }) => async () => {
      return await snapshot.getPromise(pageParameters);
    });
  },
});

export default React.memo(() => {
  const handleError = useErrorHandler();
  const [id] = useState(() => uuid());
  const options = useRecoilValue(flashlightOptions);
  const lookerOptions = useRecoilValue(flashlightLookerOptions);
  const getLookerType = useRecoilValue(lookerType);
  const lookerGeneratorRef = useRef<any>();
  const isClips = useRecoilValue(viewAtoms.isClipsView);
  const fieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE, filtered: true })
  );
  const frameFieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.FRAME, filtered: true })
  );
  lookerGeneratorRef.current = ({
    sample,
    dimensions,
    frameNumber,
    frameRate,
  }: atoms.SampleData) => {
    const constructor = getLookerType(getMimeType(sample));
    const etc = isClips ? { support: sample.support } : {};
    const config = {
      src: getSampleSrc(sample.filepath, sample._id),
      thumbnail: true,
      dimensions,
      sampleId: sample._id,
      frameRate,
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
    looker.addEventListener("error", (event) => handleError(event.detail));

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
  const flashlight = useRef<Flashlight<number>>();
  const cropToContent = useRecoilValue(atoms.cropToContent(false));
  const filters = useRecoilValue(filterAtoms.filters);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(viewAtoms.view);
  const refresh = useRecoilValue(selectors.refresh);
  const getPageParams = useRecoilValue(getPageParameters);

  const selected = useRecoilValue(atoms.selectedSamples);
  const onThumbnailClick = useThumbnailClick(flashlight);
  const onSelect = useSelect();
  const setGridZoomRange = useSetRecoilState(gridZoomRange);
  useSampleUpdate();
  const gridZoomRef = useRef<number>();
  const gridZoomValue = useRecoilValue(gridZoom);
  gridZoomRef.current = gridZoomValue;
  const tagging =
    useRecoilValue(atoms.tagging({ modal: false, labels: true })) ||
    useRecoilValue(atoms.tagging({ modal: false, labels: false }));

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

    samples = new Map();
    lookers.reset();
    freeVideos();
    sampleIndices = new Map();
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
          lookers.has(id) && lookers.get(id).resize(dimensions);
        },
        get: async (page) => {
          const params = await getPageParams();
          try {
            const { results, more } = await fetch(url, {
              method: "POST",
              cache: "no-cache",
              headers: {
                "Content-Type": "application/json",
              },
              mode: "cors",
              body: JSON.stringify({ ...params, page }),
            }).then((response) => response.json());
            const itemData = results.map((result) => {
              const data: atoms.SampleData = {
                sample: result.sample,
                dimensions: [result.width, result.height],
                frameRate: result.frame_rate,
                frameNumber: result.sample.frame_number,
              };
              samples.set(result.sample._id, data);
              sampleIndices.set(nextIndex, result.sample._id);
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
            const result = samples.get(sampleId);

            if (lookers.has(sampleId)) {
              const looker = lookers.get(sampleId);
              hide ? looker.disable() : looker.attach(element, dimensions);

              return null;
            }

            if (!soft) {
              const looker = lookerGeneratorRef.current(result);
              looker.addEventListener(
                "selectthumbnail",
                ({ detail }: { detail: string }) => onSelect(detail)
              );

              lookers.set(sampleId, looker);
              looker.attach(element, dimensions);
            }

            return null;
          } catch (error) {
            handleError(error);
          }
        },
      });
      flashlight.current.attach(id);
    } else {
      flashlight.current.updateOptions(options);
      flashlight.current.updateItems((sampleId) => {
        const looker = lookers.get(sampleId);
        looker &&
          looker.updateOptions({
            ...lookerOptions,
            selected: selected.has(sampleId),
            inSelectionMode: selected.size > 0,
          });
      });
    }
  }, [id, options, lookerOptions, selected, gridZoomRef]);

  return <Container id={id}></Container>;
});
