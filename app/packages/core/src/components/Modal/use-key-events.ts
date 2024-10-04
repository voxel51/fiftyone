import type { Lookers } from "@fiftyone/state";
import { hoveredSample } from "@fiftyone/state";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
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
  const ready = useRef(false);

  useEffect(() => {
    if (ref.current) {
      // initial call should wait for load event
      const update = () => {
        looker.updateOptions({
          shouldHandleKeyEvents: id === hoveredId,
        });
        ready.current = true;

        looker.removeEventListener("load", update);
      };
      looker.addEventListener("load", update);
    } else if (ready.current) {
      looker.updateOptions({
        shouldHandleKeyEvents: id === hoveredId,
      });
    }
  }, [hoveredId, id, looker, ref]);
}
