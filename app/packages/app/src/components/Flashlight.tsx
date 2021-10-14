import LRU from "lru-cache";
import React, {
  useLayoutEffect,
  useRef,
  useState,
  MutableRefObject,
} from "react";
import {
  atom,
  selector,
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
import { activeFields } from "./Filters/utils";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { getSampleSrc, lookerType, useClearModal } from "../recoil/utils";
import { getMimeType } from "../utils/generic";
import { filterView } from "../utils/view";
import { packageMessage } from "../utils/socket";
import socket, { http } from "../shared/connection";
import { useEventHandler, useMessageHandler } from "../utils/hooks";

export const gridZoom = atom<number | null>({
  key: "gridZoom",
  default: selectors.defaultGridZoom,
});

export const gridZoomRange = atom<[number, number]>({
  key: "gridZoomRange",
  default: [0, 10],
});

const createLookerCache = () => {
  return new LRU<string, FrameLooker | ImageLooker | VideoLooker>({
    max: 500,
    dispose: (id, looker) => looker.destroy(),
  });
};

export let samples = new Map<string, atoms.SampleData>();
export let sampleIndices = new Map<number, string>();
let nextIndex = 0;
let lookers = createLookerCache();

const url = (() => {
  let origin = window.location.origin;
  try {
    // @ts-ignore
    if (import.meta.env.DEV) {
      origin = "http://localhost:5151";
    }
  } catch {}
  return `${http}/page?`;
})();

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
      colorByLabel: get(atoms.colorByLabel(false)),
      colorMap: get(selectors.colorMap(false)),
      filter: get(labelFilters(false)),
      activePaths: get(activeFields),
      zoom: get(selectors.isPatchesView) && get(atoms.cropToContent(false)),
      loop: true,
      inSelectionMode: get(atoms.selectedSamples).size > 0,
      fieldsMap: get(selectors.primitivesDbMap("sample")),
      frameFieldsMap: get(selectors.primitivesDbMap("frame")),
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
        set(labelFilters(true), {});
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

export default React.memo(() => {
  const [id] = useState(() => uuid());
  const options = useRecoilValue(flashlightOptions);
  const lookerOptions = useRecoilValue(flashlightLookerOptions);
  const getLookerType = useRecoilValue(lookerType);
  const lookerGeneratorRef = useRef<any>();
  const schema = useRecoilValue(selectors.fieldSchema("sample"));
  const isClips = useRecoilValue(selectors.isClipsView);
  lookerGeneratorRef.current = ({
    sample,
    dimensions,
    frameNumber,
    frameRate,
  }: atoms.SampleData) => {
    const constructor = getLookerType(getMimeType(sample));
    const etc = isClips ? { support: sample.support } : {};

    return new constructor(
      sample,
      {
        src: getSampleSrc(sample.filepath, sample._id),
        thumbnail: true,
        dimensions,
        sampleId: sample._id,
        frameRate,
        frameNumber: constructor === FrameLooker ? frameNumber : null,
        fieldSchema: Object.fromEntries(schema.map((f) => [f.name, f])),
        ...etc,
      },
      { ...lookerOptions, selected: selected.has(sample._id) }
    );
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

  const filters = useRecoilValue(selectors.filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(selectors.view);
  const refresh = useRecoilValue(selectors.refresh);

  const selected = useRecoilValue(atoms.selectedSamples);
  const onThumbnailClick = useThumbnailClick(flashlight);
  const onSelect = useSelect();
  const setGridZoomRange = useSetRecoilState(gridZoomRange);
  useSampleUpdate();
  const gridZoomRef = useRef<number>();
  const gridZoomValue = useRecoilValue(gridZoom);
  gridZoomRef.current = gridZoomValue;

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
    if (!flashlight.current || !flashlight.current.isAttached()) {
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
          const { results, more } = await fetch(
            `${url}page=${page}`
          ).then((response) => response.json());
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
        },
        render: (sampleId, element, dimensions, soft) => {
          const result = samples.get(sampleId);

          if (lookers.has(sampleId)) {
            lookers.get(sampleId).attach(element, dimensions);
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
