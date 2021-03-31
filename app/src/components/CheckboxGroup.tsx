import React, { useState } from "react";
import styled from "styled-components";
import {
  Checkbox,
  FormControlLabel,
  CircularProgress,
} from "@material-ui/core";
import { ArrowDropDown, ArrowDropUp } from "@material-ui/icons";
import { useRecoilValue } from "recoil";
import { animated, useSpring } from "react-spring";

import { fieldIsFiltered } from "./Filters/LabelFieldFilters.state";
import { isBooleanField, isNumericField, isStringField } from "./Filters/utils";
import { labelTypeIsFilterable } from "../utils/labels";

import LabelFieldFilter from "./Filters/LabelFieldFilter";
import NumericFieldFilter from "./Filters/NumericFieldFilter";
import StringFieldFilter from "./Filters/StringFieldFilter";
import BooleanFieldFilter from "./Filters/BooleanFieldFilter";
import { useTheme } from "../utils/hooks";

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
  data: string | null | any;
  color: string;
  disabled: boolean;
  labelType?: string;
  path: string;
  hasDropdown: boolean;
  hideCheckbox: boolean;
  title: string;
  totalCount: number;
  filteredCount: number;
  canFilter?: boolean;
  icon?: any;
  type: string;
};

type EntryProps = {
  entry: Entry;
  modal: boolean;
  onCheck: (entry: Entry) => void;
};

const Entry = React.memo(({ entry, onCheck, modal }: EntryProps) => {
  const {
    data,
    disabled,
    color,
    hasDropdown,
    hideCheckbox,
    name,
    path,
    selected,
    title,
    canFilter,
    icon,
    type,
  } = entry;
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const fieldFiltered =
    useRecoilValue(fieldIsFiltered({ path, modal })) && canFilter;
  const isNumeric = useRecoilValue(isNumericField(path));
  const isString = useRecoilValue(isStringField(path));
  const isBoolean = useRecoilValue(isBooleanField(path));

  const checkboxClass = hideCheckbox ? "no-checkbox" : "with-checkbox";
  const containerProps = useSpring({
    backgroundColor: fieldFiltered
      ? "#6C757D"
      : hideCheckbox || selected
      ? theme.backgroundLight
      : theme.background,
  });
  const ArrowType = expanded ? ArrowDropUp : ArrowDropDown;
  return (
    <CheckboxContainer style={containerProps}>
      <FormControlLabel
        disabled={disabled}
        label={
          <>
            <span className="name" title={name}>
              {name}
            </span>
            {typeof data === "string" ? (
              <>
                <span className="count" title={title}>
                  {data}
                </span>
                {hasDropdown && (
                  <ArrowType
                    onClick={(e) => {
                      e.preventDefault();
                      setExpanded(!expanded);
                    }}
                    style={{ marginRight: -4 }}
                  />
                )}
              </>
            ) : data ? (
              data
            ) : icon ? (
              icon
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
            selected || hideCheckbox
              ? theme.font
              : entry.disabled
              ? theme.fontDarkest
              : theme.fontDark,
        }}
        control={
          <Checkbox
            checked={selected}
            title={`Show ${name} ${type}`}
            onChange={() => onCheck({ ...entry, selected: !entry.selected })}
            style={{
              display: hideCheckbox ? "none" : "block",
              color:
                selected || hideCheckbox
                  ? color
                  : disabled
                  ? theme.fontDarkest
                  : theme.fontDark,
            }}
          />
        }
      />
      {isNumeric && <NumericFieldFilter expanded={expanded} entry={entry} />}
      {isString && <StringFieldFilter expanded={expanded} entry={entry} />}
      {isBoolean && <BooleanFieldFilter expanded={expanded} entry={entry} />}
      {entry.labelType && labelTypeIsFilterable(entry.labelType) ? (
        <LabelFieldFilter expanded={expanded} entry={entry} modal={modal} />
      ) : null}
    </CheckboxContainer>
  );
});

type CheckboxGroupProps = {
  entries: Entry[];
  onCheck: (entry: Entry) => void;
  modal: boolean;
};

const CheckboxGroup = React.memo(
  ({ entries, onCheck, modal }: CheckboxGroupProps) => {
    return (
      <Body>
        {entries.map((entry) => (
          <Entry
            key={entry.name}
            entry={entry}
            onCheck={onCheck}
            modal={modal}
          />
        ))}
      </Body>
    );
  }
);

export default CheckboxGroup;
