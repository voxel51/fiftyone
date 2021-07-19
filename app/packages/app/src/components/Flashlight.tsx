import React, { useEffect, useRef, useState } from "react";
import { atom, selector, useRecoilValue } from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import Flashlight, {
  FlashlightConfig,
  FlashlightOptions,
} from "@fiftyone/flashlight";

import * as selectors from "../recoil/selectors";
import {
  FrameLooker,
  ImageLooker,
  VideoLooker,
  zoomAspectRatio,
} from "@fiftyone/looker";
import { http } from "../shared/connection";
import { scrollbarStyles } from "./utils";
import { activeFields } from "./Filters/utils";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import * as atoms from "../recoil/atoms";

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

const pageSize = selector<number>({
  key: "pageSize",
  get: ({ get }) => Math.ceil(get(gridRowAspectRatio) * 4),
});

const MARGIN = 3;

const lookers = new Map<string, ImageLooker | FrameLooker | VideoLooker>();

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

export default React.memo(() => {
  const [id] = useState(() => uuid());
  const zoom = useRecoilValue(gridRowAspectRatio);
  const activeLabels = useRecoilValue(activeFields);
  const filter = useRecoilValue(labelFilters(false));
  const colorMap = useRecoilValue(selectors.colorMap(false));
  const colorByLabel = useRecoilValue(atoms.colorByLabel(false));
  const options = useRecoilValue(flashlightOptions);
  const initialRender = useRef(true);

  const [flashlight] = useState(() => {
    return new Flashlight<number>({
      initialRequestKey: 1,
      options,
      get: (page) =>
        fetch(`${url}page=${page}`)
          .then((response) => response.json())
          .then(({ results, more }) => {
            return {
              items: results.map((result) => {
                lookers.set(
                  result.sample._id,
                  new ImageLooker(
                    result.sample,
                    {
                      src: `${http}/filepath/${encodeURI(
                        result.sample.filepath
                      )}?id=${id}`,
                      thumbnail: true,
                      dimensions: [result.width, result.height],
                      sampleId: result.sample._id,
                    },
                    {
                      activeLabels,
                      filter,
                      colorMap,
                      colorByLabel: false,
                    }
                  )
                );

                return {
                  id: result.sample._id,
                  aspectRatio: result.width / result.height,
                };
              }),
              nextRequestKey: more ? page + 1 : null,
            };
          }),
      render: (sampleId, element) => {
        lookers.get(sampleId).attach(element);
      },
    });
  });

  useEffect(() => flashlight.attach(id), [id]);

  useEffect(() => {
    if (initialRender.current) {
      return;
    }
    flashlight.updateOptions(options);
  }, [options]);

  initialRender.current = false;

  return <Container id={id}></Container>;
});
