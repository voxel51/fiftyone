import React, {
  useLayoutEffect,
  useRef,
  useState,
  MutableRefObject,
} from "react";
import { atom, selector, useRecoilCallback, useRecoilValue } from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import Flashlight, { FlashlightOptions } from "@fiftyone/flashlight";
import { ItemData } from "@fiftyone/flashlight/src/state";

import {
  FrameLooker,
  ImageLooker,
  VideoLooker,
  zoomAspectRatio,
} from "@fiftyone/looker";
import { scrollbarStyles } from "./utils";
import { activeFields } from "./Filters/utils";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { getSampleSrc, lookerType } from "../recoil/utils";
import { getMimeType } from "../utils/generic";
import { filterView } from "../utils/view";
import { packageMessage } from "../utils/socket";
import socket from "../shared/connection";

export const gridZoom = atom<number | null>({
  key: "gridZoom",
  default: selectors.defaultGridZoom,
});

const gridRowAspectRatio = selector<number>({
  key: "gridRowAspectRatio",
  get: ({ get }) => {
    return 11 - get(gridZoom);
  },
});

const MARGIN = 3;

export let samples = new Map<string, atoms.SampleData>();
export let sampleIndices = new Map<number, string>();
let nextIndex = 0;
let lookers = new Map<
  string,
  WeakRef<FrameLooker | ImageLooker | VideoLooker>
>();

const url = (() => {
  let origin = window.location.origin;
  try {
    // @ts-ignore
    if (import.meta.env.DEV) {
      origin = "http://localhost:5151";
    }
  } catch {}
  return `${origin}/page?`;
})();

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: block;
  position: relative;

  overflow-y: scroll;

  ${scrollbarStyles}
`;

const flashlightOptions = selector<FlashlightOptions>({
  key: "flashlightOptions",
  get: ({ get }) => {
    return {
      rowAspectRatioThreshold: get(gridRowAspectRatio),
      margin: MARGIN,
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
    };
  },
});

const getLooker = () => {
  return useRecoilCallback(
    ({ snapshot }) => async ({
      sample,
      dimensions,
      frameNumber,
      frameRate,
    }: atoms.SampleData) => {
      const getLookerConstructor = await snapshot.getPromise(lookerType);
      const constructor = getLookerConstructor(getMimeType(sample));
      const options = await snapshot.getPromise(flashlightLookerOptions);
      const selected = await snapshot.getPromise(atoms.selectedSamples);

      return new constructor(
        sample,
        {
          src: getSampleSrc(sample.filepath, sample._id),
          thumbnail: true,
          dimensions,
          sampleId: sample._id,
          frameRate,
          frameNumber: constructor === FrameLooker ? frameNumber : null,
        },
        { ...options, selected: selected.has(sample._id) }
      );
    },
    []
  );
};

const getAspectRatio = () => {
  return useRecoilCallback(
    ({ snapshot }) => async ({
      sample,
      dimensions: [width, height],
    }: atoms.SampleData) => {
      const options = await snapshot.getPromise(flashlightLookerOptions);
      const aspectRatio = width / height;
      return options.zoom ? zoomAspectRatio(sample, aspectRatio) : aspectRatio;
    }
  );
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
            : flashlight.current.get().then(() => {
                return samples.get(sampleIndices.get(index));
              });

          promise.then((sample) => {
            set(atoms.modal, { ...sample, index, getIndex });
          });
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
            ? [before, clickedIndex]
            : [clickedIndex, after];

        selected = new Set(
          array.filter((s) => itemIndexMap[s] < start && itemIndexMap[s] > end)
        );
      };

      if (!selected.size) {
        openModal();
        return;
      }

      const array = [...selected];
      if (event.ctrlKey && !selected.has(sampleId)) {
        addRange();
      } else if (event.ctrlKey) {
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

export default React.memo(() => {
  const [id] = useState(() => uuid());
  const options = useRecoilValue(flashlightOptions);
  const lookerOptions = useRecoilValue(flashlightLookerOptions);
  const lookerGeneratorRef = useRef<any>();
  lookerGeneratorRef.current = getLooker();
  const aspectRatioGenerator = useRef<any>();
  aspectRatioGenerator.current = getAspectRatio();
  const flashlight = useRef<Flashlight<number>>();

  const filters = useRecoilValue(selectors.filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(selectors.view);
  const refresh = useRecoilValue(selectors.refresh);

  const selected = useRecoilValue(atoms.selectedSamples);
  const onThumbnailClick = useThumbnailClick(flashlight);
  const onSelect = useSelect();

  useLayoutEffect(() => {
    if (!flashlight.current || !flashlight.current.isAttached()) {
      return;
    }

    samples = new Map();
    sampleIndices = new Map();
    nextIndex = 0;
    flashlight.current.reset();
  }, [
    flashlight,
    stringifyObj(filters),
    datasetName,
    filterView(view),
    refresh,
  ]);

  useLayoutEffect(() => {
    if (!flashlight.current) {
      flashlight.current = new Flashlight<number>({
        initialRequestKey: 1,
        options,
        onItemClick: onThumbnailClick,
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

          const items = await Promise.all<ItemData>(
            itemData.map((data) => {
              return aspectRatioGenerator.current(data).then((aspectRatio) => {
                return {
                  id: data.sample._id,
                  aspectRatio,
                };
              });
            })
          );
          return {
            items,
            nextRequestKey: more ? page + 1 : null,
          };
        },
        render: (sampleId, element, dimensions) => {
          const result = samples.get(sampleId);

          let looker, destroyed;

          lookerGeneratorRef.current(result).then((item) => {
            looker = item;
            looker.addEventListener(
              "selectthumbnail",
              ({ detail }: { detail: string }) => onSelect(detail)
            );

            if (!destroyed) {
              lookers.set(sampleId, new WeakRef(looker));
              looker.attach(element, dimensions);
            }
          });

          return () => {
            looker && looker.destroy();
            destroyed = true;
            looker = null;
          };
        },
      });
      flashlight.current.attach(id);
    } else {
      flashlight.current.updateOptions(options);
      flashlight.current.updateItems((sampleId) => {
        const looker = lookers.get(sampleId)?.deref();
        looker &&
          looker.updateOptions({
            ...lookerOptions,
            selected: selected.has(sampleId),
            inSelectionMode: selected.size > 0,
          });
      });
    }
  }, [id, options, lookerOptions, selected]);

  return <Container id={id}></Container>;
});
