import { modalSelector } from "@fiftyone/state";
import { useCallback } from "react";
import { useSetReverbState } from "@fiftyone/reverb";

export default () => {
  const setModal = useSetReverbState(modalSelector);

  return useCallback(
    (id: string) => {
      setModal((current) => {
        if (!current) {
          throw new Error("modal not defined");
        }
        return { ...current, id };
      });
    },
    [setModal],
  );
};
