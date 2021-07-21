import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { getSampleSrc, lookerType, useSetModal } from "../recoil/utils";
import { getMimeType } from "../utils/generic";
import { filterView } from "../utils/view";

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

let samples = new Map<string, atoms.SampleData>();
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
      activeLabels: get(activeFields),
      zoom: get(selectors.isPatchesView) && get(atoms.cropToContent(false)),
      loop: true,
    };
  },
});

const getLooker = () => {
  return useRecoilCallback(
    ({ snapshot }) => async (result) => {
      const getLookerConstructor = await snapshot.getPromise(lookerType);
      const constructor = getLookerConstructor(getMimeType(result.sample));
      const options = await snapshot.getPromise(flashlightLookerOptions);

      return new constructor(
        result.sample,
        {
          src: getSampleSrc(result.sample.filepath, result.sample._id),
          thumbnail: true,
          dimensions: [result.width, result.height],
          sampleId: result.sample._id,
          frameRate: result.frame_rate,
          frameNumber:
            constructor === FrameLooker ? result.sample.frame_number : null,
        },
        options
      );
    },
    []
  );
};

const getAspectRatio = () => {
  return useRecoilCallback(({ snapshot }) => async (result) => {
    const options = await snapshot.getPromise(flashlightLookerOptions);
    const aspectRatio = result.width / result.height;
    return options.zoom
      ? zoomAspectRatio(result.sample, aspectRatio)
      : aspectRatio;
  });
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

export default React.memo(() => {
  const [id] = useState(() => uuid());
  const options = useRecoilValue(flashlightOptions);
  const lookerOptions = useRecoilValue(flashlightLookerOptions);
  const lookerGeneratorRef = useRef<any>();
  lookerGeneratorRef.current = getLooker();
  const aspectRatioGenerator = useRef<any>();
  aspectRatioGenerator.current = getAspectRatio();
  const flashlight = useRef<Flashlight<number>>();
  const crop =
    useRecoilValue(selectors.isPatchesView) &&
    useRecoilValue(atoms.cropToContent(false));

  const filters = useRecoilValue(selectors.filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(selectors.view);
  const refresh = useRecoilValue(selectors.refresh);
  const setModal = useSetModal();

  useLayoutEffect(() => {
    if (!flashlight.current || !flashlight.current.isAttached()) {
      return;
    }

    samples = new Map();
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
        onClick: (sampleId) => {
          const data = samples.get(sampleId);
          setModal({
            sample: data.sample,
            dimensions: [data.width, data.height],
            frameRate: data.frame_rate,
          });
        },
        get: async (page) => {
          const { results, more } = await fetch(
            `${url}page=${page}`
          ).then((response) => response.json());

          const items = await Promise.all<ItemData>(
            results.map((result) => {
              return aspectRatioGenerator
                .current(result)
                .then((aspectRatio) => {
                  samples.set(result.sample._id, result);

                  return {
                    id: result.sample._id,
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
        render: (sampleId, element) => {
          const result = samples.get(sampleId);

          let looker, destroyed;

          lookerGeneratorRef.current(result).then((item) => {
            looker = item;

            if (!destroyed) {
              lookers.set(sampleId, new WeakRef(looker));
              looker.attach(element);
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
        looker && looker.updateOptions(lookerOptions);
      });
    }
  }, [id, options, lookerOptions]);

  return <Container id={id}></Container>;
});
