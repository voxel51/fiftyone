import { CustomizeColor, useUnprocessedStateUpdate } from "@fiftyone/state";
import { useErrorHandler } from "react-error-boundary";
import { atom, selector, useRecoilCallback, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

export const tempColorSetting = atom<CustomizeColor>({
  key: "tempAttributeColorSetting",
  default: {
    field: null,
    fieldColor: null,
    attributeForColor: null, // must be string field, int field, or boolean field
    attributeForOpacity: null, // must be float field
    colors: null, // hex colors, overwrite the default color palette
    labelColors: null,
  },
});

export const useSetCustomizeColor = () => {
  const update = useUnprocessedStateUpdate(true);
  const handleError = useErrorHandler();
  const datasetId = useRecoilValue(fos.dataset).id;

  // move tempColorSetting to customizeColors; also call mutation to update color setting to dataset.appConfig, and session config

  return useRecoilCallback(({ reset, snapshot, set }) => {});
};
