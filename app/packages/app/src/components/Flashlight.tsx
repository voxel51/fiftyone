import React, { useEffect, useState } from "react";
import { atom, selector, useRecoilValue } from "recoil";
import styled from "styled-components";
import { v4 as uuid } from "uuid";

import Flashlight from "@fiftyone/flashlight";

import * as selectors from "../recoil/selectors";

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

const samples = new Map<
  string,
  { sample: any; width: number; height: number; fps?: number }
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
                samples.set(result.sample._id, result);
                return {
                  id: result.sample._id,
                  aspectRatio: result.width / result.height,
                };
              }),
              nextRequestKey: more ? page + 1 : null,
            };
          }),
      render: (sampleId, element) => {},
    });
  });

  useEffect(() => flashlight.attach(id), [id]);

  return <Container id={id}></Container>;
});
