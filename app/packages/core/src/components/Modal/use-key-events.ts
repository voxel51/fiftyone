import type { Lookers } from "@fiftyone/state";
import { hoveredSample } from "@fiftyone/state";
import type { MutableRefObject } from "react";
import { useEffect } from "react";
import { selector, useRecoilValue } from "recoil";

export const hoveredSampleId = selector<string>({
  key: "hoveredSampleId",
  get: ({ get }) => {
    return get(hoveredSample)?._id;
  },
});

export default function (
  ref: MutableRefObject<boolean>,
  id: string,
  looker: Lookers
) {
  const hoveredId = useRecoilValue(hoveredSampleId);

  useEffect(() => {
    !ref.current &&
      looker.updateOptions({
        shouldHandleKeyEvents: id === hoveredId,
      });
  }, [hoveredId, id, looker, ref]);
}
