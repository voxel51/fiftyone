import React, { useEffect, useState } from "react";
import { atom, selector, useRecoilValue } from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import Flashlight from "@fiftyone/flashlight";

import * as selectors from "../recoil/selectors";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { http } from "../shared/connection";
import { scrollbarStyles } from "./utils";

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

export default React.memo(() => {
  const [id] = useState(() => uuid());
  const zoom = useRecoilValue(gridRowAspectRatio);
  const [flashlight] = useState(() => {
    return new Flashlight<number>({
      initialRequestKey: 1,
      options: {
        margin: MARGIN,
        rowAspectRatioThreshold: zoom,
      },
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
                    null
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

  return <Container id={id}></Container>;
});
