import React, { useMemo } from "react";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  VisibilityOff,
} from "@mui/icons-material";
import { Checkbox } from "@mui/material";
import {
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import Color from "color";

import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DETECTION,
  DETECTIONS,
  Field,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  KEYPOINTS,
  LABELS,
  LABELS_PATH,
  LIST_FIELD,
  meetsFieldType,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_KEYPOINTS,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";

import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../../Filters";

import { useTheme, PillButton } from "@fiftyone/components";
import { KeypointSkeleton } from "@fiftyone/looker/src/state";
import * as fos from "@fiftyone/state";

import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { NameAndCountContainer } from "../../utils";
import { PathEntryCounts } from "./EntryCounts";
import RegularEntry from "./RegularEntry";
import { makePseudoField, pathIsExpanded } from "./utils";
import LabelFieldFilter from "../../Filters/LabelFieldFilter";

import { labelTagCounts, sampleTagCounts } from "@fiftyone/state";

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
  ["TAG_FIELD"]: LabelFieldFilter,
};

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
};

const getFilterData = (
  path: string,
  modal: boolean,
  parent: Field,
  fields: Field[],
  skeleton: (field: string) => KeypointSkeleton | null
): {
  ftype: string;
  path: string;
  modal: boolean;
  named?: boolean;
  listField: boolean;
}[] => {
  if (!parent) {
    return [];
  }

  if (meetsFieldType(parent, { ftype: VALID_PRIMITIVE_TYPES })) {
    let ftype = parent.ftype;
    const listField = ftype === LIST_FIELD;
    if (listField) {
      ftype = parent.subfield;
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

  const label = LABELS.includes(parent.embeddedDocType);
  const excluded = EXCLUDED[parent.embeddedDocType] || [];

  const extra: {
    ftype: string;
    path: string;
    modal: boolean;
    named?: boolean;
    listField: boolean;
  }[] = [];

  if (VALID_KEYPOINTS.includes(parent.embeddedDocType)) {
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
        ftype = subfield;
      }

      return (
        !label ||
        (name !== "tags" &&
          !excluded.includes(name) &&
          VALID_PRIMITIVE_TYPES.includes(ftype))
      );
    })
    .map(({ ftype, subfield, name }) => {
      const listField = ftype === LIST_FIELD;

      if (listField) {
        ftype = subfield;
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

const hiddenPathLabels = selectorFamily<string[], string>({
  key: "hiddenPathLabels",
  get:
    (path) =>
    ({ get }) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modal).sample._id;

      if (data[sampleId]) {
        return data[sampleId][path] || [];
      }

      return [];
    },
  set:
    (path) =>
    ({ set, get }, value) => {
      const data = get(fos.pathHiddenLabelsMap);
      const sampleId = get(fos.modal).sample._id;

      set(fos.pathHiddenLabelsMap, {
        ...data,
        [sampleId]: {
          ...data[sampleId],
          [path]: value instanceof DefaultValue ? [] : value,
        },
      });
    },
});

const useHidden = (path: string) => {
  const [hidden, set] = useRecoilState(hiddenPathLabels(path));

  const num = hidden.length;

  return num ? (
    <PillButton
      text={num.toLocaleString()}
      icon={<VisibilityOff />}
      onClick={() => set([])}
      open={false}
      highlight={false}
      style={{
        height: "1.5rem",
        lineHeight: "1rem",
        padding: "0.25rem 0.5rem",
        margin: "0 0.5rem",
      }}
    />
  ) : null;
};

const FilterableEntry = React.memo(
  ({
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
    trigger: (
      event: React.MouseEvent<HTMLDivElement>,
      key: string,
      cb: () => void
    ) => void;
  }) => {
    const theme = useTheme();
    const skeleton = useRecoilValue(fos.getSkeleton);
    const expandedPath = useRecoilValue(fos.expandPath(path));
    const [expanded, setExpanded] = useRecoilState(
      pathIsExpanded({ modal, path: expandedPath })
    );
    const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;
    const color = disabled
      ? theme.background.level2
      : useRecoilValue(fos.pathColor({ path, modal }));
    const fields = useRecoilValue(
      fos.fields({
        path: expandedPath,
        ftype: VALID_PRIMITIVE_TYPES,
      })
    );

    const field = useRecoilValue(fos.field(path));
    const pseudoField = makePseudoField(path);
    const isLabelTag = path.startsWith("_label_tag");
    const isSampleTag = path.startsWith("tags");

    const data = useMemo(() => {
      if (field) {
        return getFilterData(expandedPath, modal, field, fields, skeleton);
      }
    }, [field, fields, expandedPath, modal, skeleton]);

    const fieldIsFiltered = useRecoilValue(
      fos.fieldIsFiltered({ path, modal })
    );

    const [activeField, setActiveField] = useRecoilState(
      fos.activeField({ modal, path })
    );

    const [activeTags, setActiveTags] = useRecoilState(fos.activeTags(modal));

    const [activeLabelTags, setActiveLabelTags] = useRecoilState(
      fos.activeLabelTags(modal)
    );
    const labelTagsResult = useRecoilValue(
      labelTagCounts({ modal, extended: false })
    );
    const sampleTagsResult = useRecoilValue(
      sampleTagCounts({ modal, extended: false })
    );
    const allLabelTags = Object.keys(labelTagsResult);
    const allTags = Object.keys(sampleTagsResult);

    const hidden = modal ? useHidden(path) : null;
    const onClickShow = (e) => {
      const checked = e.target.checked;
      if (disabled) return;
      if (isLabelTag) {
        setActiveLabelTags(checked ? allLabelTags : []);
      } else if (isSampleTag) {
        setActiveTags(checked ? allTags : []);
      } else {
        setActiveField(!activeField);
      }
    };

    const active = () => {
      if (path.startsWith("tag")) {
        return activeTags.length > 0;
      } else if (path.startsWith("_label_tag")) {
        return activeLabelTags.length > 0;
      } else {
        return activeField;
      }
    };

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
            {!disabled && (
              <Checkbox
                disableRipple={true}
                checked={active()}
                title={`Show ${path}`}
                style={{
                  color: active() ? color : theme.text.secondary,
                  marginLeft: 2,
                  padding: 0,
                }}
                key="checkbox"
                onClick={(e) => onClickShow(e)} // update the select tags actions
              />
            )}
            {
              <FieldLabelAndInfo
                field={field ?? pseudoField}
                color={color}
                expandedPath={expandedPath}
                template={({ hoverHanlders, hoverTarget, container }) => (
                  <NameAndCountContainer ref={container}>
                    <span key="path">
                      <span ref={hoverTarget} {...hoverHanlders}>
                        {isLabelTag
                          ? "label tags"
                          : path.startsWith("tags")
                          ? "sample tags"
                          : path}
                      </span>
                    </span>
                    {hidden}
                    <PathEntryCounts
                      key="count"
                      modal={modal}
                      path={expandedPath}
                    />
                    {!disabled && (
                      <Arrow
                        key="arrow"
                        style={{ cursor: "pointer", margin: 0 }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setExpanded(!expanded);
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                        }}
                        onMouseUp={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                        }}
                      />
                    )}
                  </NameAndCountContainer>
                )}
              />
            }
          </>
        }
        trigger={trigger}
      >
        {expanded &&
          !isLabelTag &&
          !isSampleTag &&
          data &&
          data.map(({ ftype, listField, ...props }) => {
            return React.createElement(FILTERS[ftype], {
              key: props.path,
              onFocus,
              onBlur,
              title: listField ? `${LIST_FIELD}(${ftype})` : ftype,
              ...props,
            });
          })}
        {expanded &&
          (isLabelTag || isSampleTag) &&
          React.createElement(FILTERS["TAG_FIELD"], {
            key: path,
            onFocus,
            onBlur,
            title: `${LIST_FIELD}(${STRING_FIELD})`,
            path: path,
            modal: modal,
          })}
      </RegularEntry>
    );
  }
);

export default React.memo(FilterableEntry);
