import { currentModalSample } from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";

export default () => {
  const setModal = useSetRecoilState(currentModalSample);

  return useCallback(
    (id: string) => {
      setModal((current) => {
        if (!current) {
          throw new Error("modal not defined");
        }
        return { ...current, id };
      });
    },
    [setModal]
  );
};
