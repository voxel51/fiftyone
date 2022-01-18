import React, { Suspense, useLayoutEffect, useMemo, useState } from "react";
import { Checkbox } from "@material-ui/core";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  VisibilityOff,
} from "@material-ui/icons";
import { useSpring } from "@react-spring/web";
import {
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";

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
  LABELS,
  LABELS_PATH,
  LIST_FIELD,
  meetsFieldType,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_PRIMITIVE_TYPES,
  withPath,
} from "@fiftyone/utilities";

import * as atoms from "../../../recoil/atoms";
import * as aggregationAtoms from "../../../recoil/aggregations";
import * as colorAtoms from "../../../recoil/color";
import * as filterAtoms from "../../../recoil/filters";
import * as schemaAtoms from "../../../recoil/schema";
import * as selectors from "../../../recoil/selectors";
import { useTheme } from "../../../utils/hooks";

import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../../Filters";

import { PathEntryCounts } from "./EntryCounts";
import RegularEntry from "./RegularEntry";
import { NameAndCountContainer, PillButton } from "../../utils";

const canExpand = selectorFamily<boolean, { path: string; modal: boolean }>({
  key: "sidebarCanExpand",
  get: ({ modal, path }) => ({ get }) => {
    return get(aggregationAtoms.count({ path, extended: false, modal })) > 0;
  },
});

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
};

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
};

const getFilterData = (
  path: string,
  modal: boolean,
  parent: Field,
  fields: Field[]
): {
  ftype: string;
  path: string;
  modal: boolean;
  named?: boolean;
  listField: boolean;
}[] => {
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

  return fields
    .filter(
      ({ name, ftype }) =>
        !label ||
        (name !== "tags" &&
          !excluded.includes(name) &&
          VALID_PRIMITIVE_TYPES.includes(ftype))
    )
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
    });
};

const hiddenPathLabels = selectorFamily<string[], string>({
  key: "hiddenPathLabels",
  get: (path) => ({ get }) => {
    const data = get(selectors.pathHiddenLabelsMap);
    const sampleId = get(atoms.modal).sample._id;

    if (data[sampleId]) {
      return data[sampleId][path] || [];
    }

    return [];
  },
  set: (path) => ({ set, get }, value) => {
    const data = get(selectors.pathHiddenLabelsMap);
    const sampleId = get(atoms.modal).sample._id;

    set(selectors.pathHiddenLabelsMap, {
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
    modal,
    path,
    onFocus,
    onBlur,
    disabled = false,
  }: {
    modal: boolean;
    path: string;
    group: string;
    onFocus?: () => void;
    onBlur?: () => void;
    disabled?: boolean;
  }) => {
    const [expanded, setExpanded] = useState(false);
    const theme = useTheme();
    const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;
    const expandedPath = useRecoilValue(schemaAtoms.expandPath(path));
    const color = disabled
      ? theme.backgroundDark
      : useRecoilValue(colorAtoms.pathColor({ path, modal }));
    const fields = useRecoilValue(
      schemaAtoms.fields({
        path: expandedPath,
        ftype: VALID_PRIMITIVE_TYPES,
      })
    );
    const field = useRecoilValue(schemaAtoms.field(path));
    const data = useMemo(
      () => getFilterData(expandedPath, modal, field, fields),
      [field, fields, expandedPath, modal]
    );
    const fieldIsFiltered = useRecoilValue(
      filterAtoms.fieldIsFiltered({ path, modal })
    );
    const [active, setActive] = useRecoilState(
      schemaAtoms.activeField({ modal, path })
    );
    const expandable = useRecoilValueLoadable(canExpand({ modal, path }));
    const hidden = modal ? useHidden(path) : null;

    useLayoutEffect(() => {
      expandable.state !== "loading" &&
        !expandable.contents &&
        expanded &&
        setExpanded(false);
    }, [expandable.state, expandable.contents, expanded]);

    return (
      <RegularEntry
        title={`${path} (${
          field.embeddedDocType
            ? field.embeddedDocType
            : field.subfield
            ? `${field.ftype}(${field.subfield})`
            : field.ftype
        })`}
        color={color}
        heading={
          <>
            {!disabled && (
              <Checkbox
                disableRipple={true}
                checked={active}
                title={`Show ${path}`}
                style={{
                  color: active ? color : theme.fontDark,
                  padding: 0,
                }}
                key="checkbox"
              />
            )}
            <NameAndCountContainer>
              <span key="path">{path}</span>
              {hidden}
              <PathEntryCounts key="count" modal={modal} path={expandedPath} />
              {!disabled &&
                expandable.state !== "loading" &&
                expandable.contents && (
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
                  />
                )}
            </NameAndCountContainer>
          </>
        }
        {...useSpring({
          backgroundColor: fieldIsFiltered ? "#6C757D" : theme.backgroundLight,
        })}
        onClick={!disabled ? () => setActive(!active) : null}
      >
        <Suspense fallback={null}>
          {expanded &&
            data.map(({ ftype, listField, ...props }) => {
              return React.createElement(FILTERS[ftype], {
                key: props.path,
                onFocus,
                onBlur,
                title: listField ? `${LIST_FIELD}(${ftype})` : ftype,
                ...props,
              });
            })}
        </Suspense>
      </RegularEntry>
    );
  }
);

export default React.memo(FilterableEntry);
