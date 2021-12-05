import React, { useState } from "react";
import { Checkbox } from "@material-ui/core";
import { ArrowDropDown, ArrowDropUp } from "@material-ui/icons";
import { useSpring } from "@react-spring/web";
import { useRecoilState, useRecoilValue } from "recoil";

import * as colorAtoms from "../../../recoil/color";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_LABEL_TYPES,
  VALID_PRIMITIVE_TYPES,
} from "../../../recoil/constants";
import * as filterAtoms from "../../../recoil/filters";
import * as schemaAtoms from "../../../recoil/schema";
import { State } from "../../../recoil/types";
import { useTheme } from "../../../utils/hooks";

import {
  BooleanFieldFilter,
  NumericFieldFilter,
  StringFieldFilter,
} from "../../Filters";

import { PathEntryCounts } from "./EntryCounts";
import RegularEntry from "./RegularEntry";

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

const getFilterData = (
  path: string,
  modal: boolean,
  parent: State.Field,
  fields: State.Field[]
): { ftype: string; path: string; modal: boolean; named?: boolean }[] => {
  if (schemaAtoms.meetsFieldType(parent, { ftype: VALID_PRIMITIVE_TYPES })) {
    let ftype = parent.ftype;
    if (ftype === LIST_FIELD) {
      ftype = parent.subfield;
    }

    return [
      {
        ftype,
        path,
        modal,
        named: false,
      },
    ];
  }

  const label = VALID_LABEL_TYPES.includes(parent.embeddedDocType);

  return fields
    .filter(({ name }) => !label || name !== "tags")
    .map(({ ftype, subfield, name }) => ({
      path: [path, name].join("."),
      modal,
      ftype: ftype === LIST_FIELD ? subfield : ftype,
      named: true,
    }));
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
    const Arrow = expanded ? ArrowDropUp : ArrowDropDown;
    const expandedPath = useRecoilValue(schemaAtoms.expandPath(path));
    const color = useRecoilValue(colorAtoms.pathColor({ path, modal }));
    const fields = useRecoilValue(
      schemaAtoms.fields({
        path: expandedPath,
        ftype: VALID_PRIMITIVE_TYPES,
      })
    );
    const field = useRecoilValue(schemaAtoms.field(path));
    const data = getFilterData(expandedPath, modal, field, fields);
    const fieldIsFiltered = useRecoilValue(
      filterAtoms.fieldIsFiltered({ path, modal })
    );
    const theme = useTheme();
    const [active, setActive] = useRecoilState(
      schemaAtoms.activeField({ modal, path })
    );

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
            />
            <span style={{ flexGrow: 1 }}>{path}</span>
            <PathEntryCounts modal={modal} path={expandedPath} />

            <Arrow
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
          </>
        }
        {...useSpring({
          backgroundColor: fieldIsFiltered ? "#6C757D" : theme.backgroundLight,
        })}
        onClick={() => setActive(!active)}
      >
        {expanded &&
          data.map(({ ftype, ...props }) =>
            React.createElement(FILTERS[ftype], {
              key: props.path,
              onFocus,
              onBlur,
              ...props,
            })
          )}
      </RegularEntry>
    );
  }
);

export default React.memo(FilterableEntry);
