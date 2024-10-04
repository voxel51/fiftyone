import type { Lookers } from "@fiftyone/state";
import { hoveredSample } from "@fiftyone/state";
import { useEffect } from "react";
import { selector, useRecoilValue } from "recoil";

export const hoveredSampleId = selector<string>({
  key: "hoveredSampleId",
  get: ({ get }) => {
    return get(hoveredSample)?._id;
  },
});

export default function (id: string, looker: Lookers) {
  const hoveredId = useRecoilValue(hoveredSampleId);

  useEffect(() => {
    const load = () => {
      looker.updateOptions({
        shouldHandleKeyEvents: id === hoveredId,
      });
      looker.removeEventListener("load", load);
    };
    looker.addEventListener("load", load);
  }, [hoveredId, id, looker]);
}
