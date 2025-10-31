import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";

export default function (mode: "annotate" | "explore") {
  const datasetColorScheme = useRecoilValue(fos.datasetColorScheme);
  const setColorScheme = useSetRecoilState(fos.colorScheme);

  useEffect(() => {
    if (datasetColorScheme) {
      return;
    }

    setColorScheme((cur) => ({
      ...cur,
      colorBy: mode === "annotate" ? "value" : "field",
    }));
  }, [datasetColorScheme, mode, setColorScheme]);
}
