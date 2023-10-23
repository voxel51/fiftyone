import { useTheme } from "@fiftyone/components";
import { KeypointSkeleton } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DETECTION,
  DETECTIONS,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  Field,
  INT_FIELD,
  KEYPOINTS,
  LABELS,
  LABELS_PATH,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_KEYPOINTS,
  VALID_PRIMITIVE_TYPES,
  meetsFieldType,
  withPath,
} from "@fiftyone/utilities";
import { Checkbox } from "@mui/material";
import Color from "color";
import React, { useMemo } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import FieldLabelAndInfo from "../../../FieldLabelAndInfo";
import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../../../Filters";
import LabelFieldFilter from "../../../Filters/LabelFieldFilter";
import RegularEntry from "../RegularEntry";
import { makePseudoField, pathIsExpanded } from "../utils";
import createTitleTemplate from "./createTitleTemplate";

const FILTERS = {
  [BOOLEAN_FIELD]: BooleanFieldFilter,
  [DATE_FIELD]: NumericFieldFilter,
  [DATE_TIME_FIELD]: NumericFieldFilter,
  [FLOAT_FIELD]: NumericFieldFilter,
  [FRAME_NUMBER_FIELD]: NumericFieldFilter,
  [FRAME_SUPPORT_FIELD]: NumericFieldFilter,
  [INT_FIELD]: NumericFieldFilter,
  [OBJECT_ID_FIELD]: StringFieldFilter,
  [STRING_FIELD]: StringFieldFilter,
  ["_LABEL_TAGS"]: LabelFieldFilter,
};

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
};

interface FilterItem {
  ftype: string;
  path: string;
  modal: boolean;
  named?: boolean;
  listField: boolean;
  title?: string;
}

const getFilterData = (
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

const useOnClick = ({
  disabled,
  modal,
  path,
}: {
  disabled: boolean;
  modal: boolean;
  path: string;
}) => {
  return useRecoilCallback<[React.MouseEvent<HTMLButtonElement>], void>(
    ({ set }) =>
      async (event) => {
        if (disabled) return;
        const checked = (event.target as HTMLInputElement).checked;
        set(fos.activeField({ modal, path }), checked);
      },
    [disabled, modal, path]
  );
};

const FilterableEntry = ({
  entryKey,
  modal,
  path,
  onFocus,
  onBlur,
  disabled = false,
  trigger,
}: {
  disabled?: boolean;
  entryKey: string;
  group: string;
  modal: boolean;
  path: string;
  onFocus?: () => void;
  onBlur?: () => void;
  trigger?: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}) => {
  const theme = useTheme();
  const skeleton = useRecoilValue(fos.getSkeleton);
  const expandedPath = useRecoilValue(fos.expandPath(path));

  const activeColor = useRecoilValue(fos.pathColor(path));
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);

  const color = disabled ? theme.background.level2 : activeColor;
  const fields = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: VALID_PRIMITIVE_TYPES,
    })
  );
  const expanded = useRecoilValue(
    pathIsExpanded({ modal, path: expandedPath })
  );

  const field = useRecoilValue(fos.field(path));
  const pseudoField = makePseudoField(path);

  const data = useMemo(() => {
    return getFilterData(expandedPath, modal, field, fields, skeleton);
  }, [field, fields, expandedPath, modal, skeleton]);

  const fieldIsFiltered = useRecoilValue(fos.fieldIsFiltered({ path, modal }));

  const active = useRecoilValue(fos.activeField({ modal, path }));

  const onClick = useOnClick({ disabled, modal, path });
  const isLabelTag = path === "_label_tags";
  const lightning = !useRecoilValue(fos.pathIsLocked(path));

  console.log(path, lightning);
  return (
    <RegularEntry
      backgroundColor={
        fieldIsFiltered
          ? Color(color).alpha(0.25).string()
          : theme.background.level1
      }
      color={color}
      entryKey={entryKey}
      heading={
        <>
          {!disabled && !(modal && isLabelTag) && (
            <Checkbox
              checked={active}
              title={`Show ${path}`}
              style={{
                color: active ? color : theme.text.secondary,
                marginLeft: 2,
                padding: 0,
              }}
              key="checkbox"
              data-cy={`checkbox-${path}`}
              onClick={onClick}
            />
          )}
          {
            <FieldLabelAndInfo
              field={field ?? pseudoField}
              path={path}
              color={color}
              expandedPath={expandedPath}
              template={createTitleTemplate({
                disabled,
                expandedPath,
                modal,
                path,
                showCounts: isFilterMode,
                lightning,
              })}
            />
          }
        </>
      }
      trigger={trigger}
    >
      {expanded &&
        data &&
        data.map(({ ftype, listField, title, ...props }) => {
          return React.createElement(FILTERS[ftype], {
            key: props.path,
            onFocus,
            onBlur,
            title: title || (listField ? `${LIST_FIELD}(${ftype})` : ftype),
            color: activeColor,
            ...props,
          });
        })}
    </RegularEntry>
  );
};

export default React.memo(FilterableEntry);
