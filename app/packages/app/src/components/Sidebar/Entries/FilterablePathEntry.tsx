import React, { Suspense, useMemo, useState } from "react";
import { Checkbox } from "@material-ui/core";
import { KeyboardArrowDown, KeyboardArrowUp } from "@material-ui/icons";
import { useSpring } from "@react-spring/web";
import {
  selectorFamily,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";

import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  Field,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";

import * as aggregationAtoms from "../../../recoil/aggregations";
import * as colorAtoms from "../../../recoil/color";
import * as filterAtoms from "../../../recoil/filters";
import * as schemaAtoms from "../../../recoil/schema";
import { useTheme } from "../../../utils/hooks";

import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../../Filters";

import { PathEntryCounts } from "./EntryCounts";
import RegularEntry from "./RegularEntry";
import { NameAndCountContainer } from "../../utils";

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

export const DETECTION = ["bounding_box"];

const EXCLUDED = {
  [withPath(LABELS_PATH, DETECTION)]: DETECTION,
  [withPath(LABELS_PATH, "Detections")]: DETECTION,
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
  if (schemaAtoms.meetsFieldType(parent, { ftype: VALID_PRIMITIVE_TYPES })) {
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
      ({ name }) => !label || (name !== "tags" && !excluded.includes(name))
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

const FilterableEntry = React.memo(
  ({
    modal,
    path,
    onFocus,
    onBlur,
  }: {
    modal: boolean;
    path: string;
    group: string;
    onFocus?: () => void;
    onBlur?: () => void;
  }) => {
    const [expanded, setExpanded] = useState(false);
    const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;
    const expandedPath = useRecoilValue(schemaAtoms.expandPath(path));
    const color = useRecoilValue(colorAtoms.pathColor({ path, modal }));
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
    const theme = useTheme();
    const [active, setActive] = useRecoilState(
      schemaAtoms.activeField({ modal, path })
    );
    const expandable = useRecoilValueLoadable(canExpand({ modal, path }));

    return (
      <RegularEntry
        title={`${path}: ${
          field.embeddedDocType ? field.embeddedDocType : field.ftype
        }`}
        heading={
          <>
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
            <NameAndCountContainer>
              <span key="path">{path}</span>
              <PathEntryCounts key="count" modal={modal} path={expandedPath} />
              {expandable.state !== "loading" && expandable.contents && (
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
        onClick={() => setActive(!active)}
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
