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
  //   const update = useUnprocessedStateUpdate(true);
  //   const handleError = useErrorHandler();
  //   const datasetId = useRecoilValue(fos.dataset).id;
  //   const fieldPath = useRecoilValue(tempColorSetting).field
  //   const tempColor = useRecoilValue(tempColorSetting);
  //   const current = useRecoilValue(fos.customizeColorFields);
  //   console.info('current', current)
  //   // move tempColorSetting to customizeColors; also call mutation to update color setting to dataset.appConfig, and session config
  //   return useRecoilCallback(
  //     ({ reset, snapshot, set }) =>
  //       () => {
  //         set(fos.customizeColorFields, [...current, fieldPath]); // add field to customizeColorFields
  //         set(fos.customizeColorSelector(fieldPath), tempColor);
  //       },
  //     []
  //   );
};

// Masataka Okabe and Kei Ito have proposed a palette of 8 colors on their website Color Universal Design (CUD). This palette is a “Set of colors that is unambiguous both to colorblinds and non-colorblinds”.
// https://jfly.uni-koeln.de/color/
export const colorBlindFriendlyPalette = [
  "#000000", // black
  "#E69F00", // orange
  "#56b4e9", // skyblue
  "#009e74", // bluegreen
  "#f0e442", // yellow
  "#0072b2", // blue
  "#d55e00", // vermillion
  "#cc79a7", // reddish purple
];
