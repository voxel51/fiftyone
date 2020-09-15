import React, { useContext, useState } from "react";
import styled, { ThemeContext } from "styled-components";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import { ArrowDropDown } from "@material-ui/icons";
import { useRecoilValue } from "recoil";
import { animated, useSpring } from "react-spring";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

import Filter from "./Filter";
import NumericFieldFilter from "./NumericFieldFilter";

const GLOBAL_ATOMS = {
  includeLabels: atoms.filterIncludeLabels,
  invertInclude: atoms.filterInvertIncludeLabels,
  includeNoConfidence: atoms.filterLabelIncludeNoConfidence,
  confidenceRange: atoms.filterLabelConfidenceRange,
  confidenceBounds: selectors.labelConfidenceBounds,
  fieldIsFiltered: selectors.fieldIsFiltered,
};

const MODAL_ATOMS = {
  includeLabels: atoms.modalFilterIncludeLabels,
  invertInclude: atoms.modalFilterInvertIncludeLabels,
  includeNoConfidence: atoms.modalFilterLabelIncludeNoConfidence,
  confidenceRange: atoms.modalFilterLabelConfidenceRange,
  confidenceBounds: selectors.labelConfidenceBounds,
  fieldIsFiltered: selectors.modalFieldIsFiltered,
};

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
      max-width: calc(100% - 24px);
    }

    .MuiCheckbox-root {
      padding: 0;

      .MuiIconButton-label {
        position: relative;
        svg {
          z-index: 1;
        }
      }

      &.Mui-checked .MuiIconButton-label::after {
          /* fill checkmark with font color */
          content: "";
          position: absolute;
          background: ${({ theme }) => theme.font};
          top: 0.2em;
          left: 0.2em;
          width: 0.6em;
          height: 0.6em;
          z-index: 0;
        }
      }
    }

    .MuiFormControlLabel-label {
      display: inline-flex;
      font-weight: bold;
      color: unset;

      span {
        display: inline-block;
      }

      span.name {
        padding: 0 4px;
        white-space: nowrap;
        overflow-x: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
        max-width: 100%;
        line-height: 24px;
      }
      span.count {
        white-space: nowrap;
      }

      span.data {
        margin-left: 0.5em;
        line-height: 24px;
      }
    }
  }

  && .Mui-disabled {
    cursor: not-allowed;
    color: ${({ theme }) => theme.fontDarkest};

    svg, input[type=checkbox] {
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
};

type Props = {
  entries: Entry[];
  onCheck: (entry: Entry) => void;
  modal: boolean;
};

const Entry = ({ entry, onCheck, modal }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useContext(ThemeContext);
  const atoms = modal ? MODAL_ATOMS : GLOBAL_ATOMS;
  const fieldIsFiltered = useRecoilValue(atoms.fieldIsFiltered(entry.name));
  const isNumericField = useRecoilValue(selectors.isNumericField(entry.name));

  const handleCheck = (entry) => {
    if (onCheck) {
      onCheck({ ...entry, selected: !entry.selected });
    }
  };

  const checkboxClass = entry.hideCheckbox ? "no-checkbox" : "with-checkbox";
  const containerProps = useSpring({
    backgroundColor: fieldIsFiltered
      ? "#6C757D"
      : entry.hideCheckbox || entry.selected
      ? theme.backgroundLight
      : theme.background,
  });

  return (
    <CheckboxContainer key={entry.name} style={containerProps}>
      <FormControlLabel
        disabled={entry.disabled}
        label={
          <>
            <span className="name" title={entry.name}>
              {entry.name}
            </span>
            <span className="count" title={entry.data}>
              {entry.data}
            </span>
            {!(
              entry.icon &&
              !["Detections", "Classifications"].includes(entry.type)
            ) &&
              (entry.type || (isNumericField && !modal)) && (
                <ArrowDropDown
                  onClick={(e) => {
                    e.preventDefault();
                    setExpanded(!expanded);
                  }}
                  style={{ marginRight: -4 }}
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
      {isNumericField && (
        <NumericFieldFilter expanded={expanded} entry={entry} />
      )}
      {entry.type && (
        <Filter expanded={expanded} entry={entry} {...atoms} modal={modal} />
      )}
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
