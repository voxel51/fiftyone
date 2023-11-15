import { field } from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  KEYPOINTS_FIELD,
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
        get(isInListField(path)) &&
        get(parentField(path))?.embeddedDocType === KEYPOINTS_FIELD
      );
    },
});

export const isInListField = selectorFamily({
  key: "isInListField",
  get:
    (path: string) =>
    ({ get }) => {
      const parent = get(parentField(path));

      return (
        parent?.ftype === LIST_FIELD &&
        parent?.subfield === EMBEDDED_DOCUMENT_FIELD
      );
    },
});

const parentField = selectorFamily({
  key: "parentField",
  get:
    (path: string) =>
    ({ get }) => {
      const parent = path.split(".").slice(0, -1).join(".");
      return get(field(parent));
    },
});
