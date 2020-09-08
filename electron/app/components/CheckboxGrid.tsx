import React, { useContext, useState } from "react";
import styled, { ThemeContext } from "styled-components";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import { ArrowDropDown } from "@material-ui/icons";
import { useRecoilValue } from "recoil";

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
};

const MODAL_ATOMS = {
  includeLabels: atoms.modalFilterIncludeLabels,
  invertInclude: atoms.modalFilterInvertIncludeLabels,
  includeNoConfidence: atoms.modalFilterLabelIncludeNoConfidence,
  confidenceRange: atoms.modalFilterLabelConfidenceRange,
  confidenceBounds: selectors.labelConfidenceBounds,
};

const Body = styled.div`
  vertical-align: middle;
  font-weight: bold;

  & > div {
    margin-top: 3px;
    margin-bottom: 3px;
    margin-left: 0;
    margin-right: 0;
    padding: 0.2em;
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
      padding-right: 4px;
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
        padding-left: 4px;
        white-space: nowrap;
        overflow-x: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
        max-width: 100%;
        line-height: 24px;
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
  const fieldIsFiltered = useRecoilValue(selectors.fieldIsFiltered(entry.name));
  const isNumericField = useRecoilValue(selectors.isNumericField(entry.name));

  const handleCheck = (entry) => {
    if (onCheck) {
      onCheck({ ...entry, selected: !entry.selected });
    }
  };
  const atoms = modal ? MODAL_ATOMS : GLOBAL_ATOMS;

  const checkboxClass = entry.hideCheckbox ? "no-checkbox" : "with-checkbox";

  return (
    <div
      key={entry.name}
      style={{
        border: fieldIsFiltered
          ? `1px solid ${theme.fontDark}`
          : entry.hideCheckbox || entry.selected
          ? `1px solid ${theme.background}`
          : `1px solid transparent`,
        backgroundColor:
          entry.hideCheckbox || entry.selected
            ? theme.backgroundLight
            : undefined,
      }}
    >
      <FormControlLabel
        disabled={entry.disabled}
        label={
          <>
            <span className="name" title={entry.name}>
              {entry.name}
            </span>
            {entry.data}
            {!(
              entry.icon &&
              !["Detections", "Classifications"].includes(entry.type)
            ) &&
              entry.selected &&
              entry.type &&
              entry.count > 0 && (
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
      {expanded &&
        entry.selected &&
        (isNumericField ? (
          <NumericFieldFilter entry={entry} />
        ) : (
          <Filter entry={entry} {...atoms} />
        ))}
    </div>
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
