import React, { useContext, useState } from "react";
import styled, { ThemeContext } from "styled-components";
import {
  Checkbox,
  FormControlLabel,
  CircularProgress,
} from "@material-ui/core";
import { ArrowDropDown, ArrowDropUp } from "@material-ui/icons";
import { useRecoilValue } from "recoil";
import { animated, useSpring } from "react-spring";

import * as atoms from "../recoil/atoms";
import { fieldIsFiltered } from "./Filters/LabelFieldFilters.state";
import { isBooleanField, isNumericField, isStringField } from "./Filters/utils";
import { SampleContext } from "../utils/context";
import { labelTypeIsFilterable, LABEL_LISTS } from "../utils/labels";

import LabelFieldFilter from "./Filters/LabelFieldFilter";
import NumericFieldFilter from "./Filters/NumericFieldFilter";
import StringFieldFilter from "./Filters/StringFieldFilter";
import BooleanFieldFilter from "./Filters/BooleanFieldFilter";

const Body = styled.div`
  vertical-align: middle;
  font-weight: bold;

  & > div {
    margin-top: 3px;
    margin-left: 0;
    margin-right: 0;
    padding: 0 0.2em;
    border-radius: 2px;
  }

  label {
    margin: 0;
    width: 100%;
    height: 32px;
    display: flex;
    justify-content: space-between;

    .MuiTypography-body1 {
      flex: 1;
      font-size: unset;
      align-items: center;
      padding-right: 3px;
      max-width: 100%;
    }

    .MuiTypography-body1.with-checkbox {
      max-width: calc(100% - 36px);
    }
    overflow: "hidden", .MuiCheckbox-root {
      padding: 0;

      .MuiIconButton-label {
        position: relative;
        svg {
          z-index: 2;
        }
      }
    }

    .MuiFormControlLabel-label {
      display: flex;
      font-weight: bold;
      color: unset;
      line-height: 29px;
      height: 29px;

      span.name {
        display: block;
        padding: 0 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
        max-width: 100%;
        line-height: 29px;
        height: 29px;
        align-items: center;
        vertical-align: middle;
      }
      span.count {
        display: block;
        white-space: nowrap;
        height: 29px;
        line-height: 29px;
        vertical-align: middle;
      }

      span.data {
        display: block;
        margin-left: 0.5em;
        line-height: 29px;
        display: flex;
        vertical-align: middle;
        align-items: center;
      }
    }
  }

  && .Mui-disabled {
    cursor: not-allowed;
    color: ${({ theme }) => theme.fontDarkest};

    svg,
    input[type="checkbox"] {
      display: none;
    }
  }

  && .no-checkbox {
    cursor: default;
  }
`;

const CheckboxContainer = animated(styled.div``);

export type Entry = {
  name: string;
  selected: boolean;
  data: Any;
  color: string;
  disabled: boolean;
  type?: string;
  prefix: string;
};

type Props = {
  entries: Entry[];
  onCheck: (entry: Entry) => void;
  modal: boolean;
};

const Entry = ({ entry, onCheck, modal }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useContext(ThemeContext);
  const fieldFiltered = useRecoilValue(
    fieldIsFiltered({ path: entry.path, modal: Boolean(modal) })
  );
  const isNumeric = useRecoilValue(isNumericField(entry.path));
  const isString = useRecoilValue(isStringField(entry.path));
  const isBoolean = useRecoilValue(isBooleanField(entry.path));

  const handleCheck = (entry) => {
    if (onCheck) {
      onCheck({ ...entry, selected: !entry.selected });
    }
  };

  const sample = useContext(SampleContext);
  const hiddenObjects = useRecoilValue(atoms.hiddenObjects);
  const hasHiddenObjects = sample
    ? Object.entries(hiddenObjects).some(
        ([_, data]) =>
          data.sample_id === sample._id && data.field === entry.name
      )
    : false;

  const checkboxClass = entry.hideCheckbox ? "no-checkbox" : "with-checkbox";
  const containerProps = useSpring({
    backgroundColor:
      fieldFiltered || hasHiddenObjects
        ? "#6C757D"
        : entry.hideCheckbox || entry.selected
        ? theme.backgroundLight
        : theme.background,
  });
  const ArrowType = expanded ? ArrowDropUp : ArrowDropDown;

  return (
    <CheckboxContainer key={entry.name} style={containerProps}>
      <FormControlLabel
        disabled={entry.disabled}
        label={
          <>
            <span className="name" title={entry.name}>
              {entry.name}
            </span>
            {entry.data !== null ? (
              <>
                <span className="count" title={entry.data}>
                  {entry.data}
                </span>
                {!(entry.icon && !LABEL_LISTS.includes(entry.type)) &&
                ((entry.type && labelTypeIsFilterable(entry.type)) ||
                  ((isNumeric || isString || isBoolean) && !modal)) ? (
                  <ArrowType
                    onClick={(e) => {
                      e.preventDefault();
                      setExpanded(!expanded);
                    }}
                    style={{ marginRight: -4 }}
                  />
                ) : null}
              </>
            ) : (
              <CircularProgress
                style={{
                  color: theme.font,
                  height: 16,
                  width: 16,
                  minWidth: 16,
                }}
              />
            )}
          </>
        }
        classes={{
          root: checkboxClass,
          label: checkboxClass,
        }}
        style={{
          width: "100%",
          color:
            entry.selected || entry.hideCheckbox
              ? theme.font
              : entry.disabled
              ? theme.fontDarkest
              : theme.fontDark,
        }}
        control={
          <Checkbox
            checked={entry.selected}
            onChange={() => handleCheck(entry)}
            style={{
              display: entry.hideCheckbox ? "none" : "block",
              color:
                entry.selected || entry.hideCheckbox
                  ? entry.color
                  : entry.disabled
                  ? theme.fontDarkest
                  : theme.fontDark,
            }}
          />
        }
      />
      {isNumeric && <NumericFieldFilter expanded={expanded} entry={entry} />}
      {isString && <StringFieldFilter expanded={expanded} entry={entry} />}
      {isBoolean && <BooleanFieldFilter expanded={expanded} entry={entry} />}
      {entry.type && labelTypeIsFilterable(entry.type) ? (
        <LabelFieldFilter expanded={expanded} entry={entry} modal={modal} />
      ) : null}
    </CheckboxContainer>
  );
};

const CheckboxGrid = ({ entries, onCheck, modal }: Props) => {
  return (
    <Body>
      {entries.map((entry) => (
        <Entry key={entry.name} entry={entry} onCheck={onCheck} modal={modal} />
      ))}
    </Body>
  );
};

export default CheckboxGrid;
