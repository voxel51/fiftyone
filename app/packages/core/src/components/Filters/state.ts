import { field, parentField } from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  KEYPOINTS_POINTS_FIELD,
  KEYPOINT_FIELD,
  LIST_FIELD,
} from "@fiftyone/utilities";
import { selectorFamily } from "recoil";

export const isBooleanField = selectorFamily({
  key: "isBooleanField",
  get:
    (path: string) =>
    ({ get }) => {
      const f = get(field(path));
      return f?.ftype === BOOLEAN_FIELD || f?.subfield === BOOLEAN_FIELD;
    },
});

export const isInKeypointsField = selectorFamily({
  key: "isInKeypointsField",
  get:
    (path: string) =>
    ({ get }) => {
      return (
        [KEYPOINTS_POINTS_FIELD, LIST_FIELD].includes(
          get(field(path))?.ftype || ""
        ) && get(parentField(path))?.embeddedDocType === KEYPOINT_FIELD
      );
    },
});
