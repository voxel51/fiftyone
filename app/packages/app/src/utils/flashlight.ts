import { Render } from "@fiftyone/flashlight";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { MutableRefObject } from "react";
import { SampleData } from "../recoil/atoms";
export const makeFlashlightLookerRenderer: <
  T extends FrameLooker | ImageLooker | VideoLooker
>(
  store,
  onSelect: (id: string) => void,
  onError: (error: Error) => void,
  generator: MutableRefObject<((data: SampleData) => T) | undefined>
) => Render = (store, onSelect, onError, generator) => {
  return (id, element, dimensions, soft, hide) => {
    try {
      const result = store.samples.get(id);

      if (store.lookers.has(id)) {
        const looker = store.lookers.get(id);
        hide ? looker.disable() : looker.attach(element, dimensions);

        return;
      }

      if (!generator.current) {
        throw new Error("no generator");
      }

      if (!soft) {
        const looker = generator.current(result);
        looker.addEventListener("selectthumbnail", ({ detail }) =>
          onSelect(detail)
        );

        store.lookers.set(id, looker);
        looker.attach(element, dimensions);
      }
    } catch (error) {
      onError(error);
    }
  };
};
