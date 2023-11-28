import { field, isInListField, parentField } from "@fiftyone/state";
import { BOOLEAN_FIELD, KEYPOINTS_FIELD } from "@fiftyone/utilities";
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
        get(isInListField(path)) &&
        get(parentField(path))?.embeddedDocType === KEYPOINTS_FIELD
      );
    },
});
