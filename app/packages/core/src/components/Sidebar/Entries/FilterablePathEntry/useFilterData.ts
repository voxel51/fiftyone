import { KeypointSkeleton } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
import { getSkeleton } from "@fiftyone/state";
import {
  DETECTION,
  DETECTIONS,
  Field,
  KEYPOINTS,
  LABELS,
  LABELS_PATH,
  LIST_FIELD,
  STRING_FIELD,
  VALID_KEYPOINTS,
  VALID_PRIMITIVE_TYPES,
  meetsFieldType,
  withPath,
} from "@fiftyone/utilities";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import FilterItem from "./FilterItem";

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
};

export const getFilterItemsProps = (
  path: string,
  modal: boolean,
  parent: Field | null,
  fields: Field[],
  skeleton: (field: string) => KeypointSkeleton | null
): FilterItem[] => {
  if (path === "_label_tags") {
    return [
      {
        ftype: "_LABEL_TAGS",
        title: `${LIST_FIELD}(${STRING_FIELD})`,
        path: path,
        modal: modal,
        listField: false,
      },
    ];
  }
  if (!parent) {
    return [];
  }

  if (meetsFieldType(parent, { ftype: VALID_PRIMITIVE_TYPES })) {
    let ftype = parent.ftype;
    const listField = ftype === LIST_FIELD;
    if (listField) {
      ftype = parent.subfield as string;
    }

    return [
      {
        ftype,
        path,
        modal,
        named: false,
        listField,
      },
    ];
  }

  const label = LABELS.includes(parent.embeddedDocType as string);
  const excluded = EXCLUDED[parent.embeddedDocType as string] || [];

  const extra: FilterItem[] = [];

  if (VALID_KEYPOINTS.includes(parent.embeddedDocType as string)) {
    let p = path;
    if (withPath(LABELS_PATH, KEYPOINTS) === parent.embeddedDocType) {
      p = path.split(".").slice(0, -1).join(".");
    }

    if (skeleton(p)) {
      extra.push({
        path: [path, "points"].join("."),
        modal,
        named: true,
        ftype: STRING_FIELD,
        listField: false,
      });
    }
  }

  return fields
    .filter(({ name, ftype, subfield }) => {
      if (ftype === LIST_FIELD) {
        ftype = subfield as string;
      }

      return (
        !label ||
        (!excluded.includes(name) && VALID_PRIMITIVE_TYPES.includes(ftype))
      );
    })
    .map<FilterItem>(({ ftype, subfield, name }) => {
      const listField = ftype === LIST_FIELD;

      if (listField) {
        ftype = subfield as string;
      }

      return {
        path: [path, name].join("."),
        modal,
        ftype,
        named: true,
        listField,
      };
    })
    .concat(extra);
};

const useFilterData = (
  modal: boolean,
  path: string,
  filter?: (path: string) => boolean
) => {
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const field = useRecoilValue(fos.field(path));
  const fields = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: VALID_PRIMITIVE_TYPES,
    })
  );

  const skeleton = useRecoilValue(getSkeleton);
  return useMemo(() => {
    const data = getFilterItemsProps(
      expandedPath,
      modal,
      field,
      fields,
      skeleton
    );
    const filtered = filter ? data.filter(({ path }) => filter(path)) : data;
    const rest = filter ? data.filter(({ path }) => !filter(path)) : data;
    return {
      data: filtered,
      removed: rest,
    };
  }, [field, fields, filter, expandedPath, modal, skeleton]);
};

export default useFilterData;
