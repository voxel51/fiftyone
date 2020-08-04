import React from "react";
import styled, { ThemeConsumer } from "styled-components";
import { Checkbox, FormControlLabel } from "@material-ui/core";

const Body = styled.div`
  vertical-align: middle;

  label {
    width: 100%;
    margin-top: 3px;
    margin-bottom: 3px;
    margin-left: 0;
    margin-right: 0;

    .MuiTypography-body1 {
      font-size: unset;
    }

    .MuiCheckbox-root {
      padding: 3px;
    }

    .MuiFormControlLabel-label {
      width: 100%;
      font-weight: bold;
      padding-right: 6px;

      span.data {
        float: right;
      }
    }
  }
`;

export type Entry = {
  name: string;
  selected: boolean;
  data: Any;
  color: string;
};

type Props = {
  entries: Entry[];
  onCheck: (entry: Entry) => void;
};

const CheckboxGrid = ({ entries, onCheck }: Props) => {
  const handleCheck = (entry) => {
    if (onCheck) {
      onCheck({ ...entry, selected: !entry.selected });
    }
  };

  return (
    <ThemeConsumer>
      {(theme) => (
        <Body>
          {entries.map((entry) => (
            <div key={entry.name}>
              <FormControlLabel
                label={
                  <>
                    <span className="name">{entry.name}</span>
                    <span className="data">{entry.data}</span>
                  </>
                }
                style={{
                  backgroundColor: entry.selected
                    ? theme.backgroundLight
                    : undefined,
                  color: entry.selected ? theme.font : theme.fontDark,
                }}
                control={
                  <Checkbox
                    checked={entry.selected}
                    onChange={() => handleCheck(entry)}
                    style={{
                      color: entry.selected ? entry.color : theme.fontDark,
                    }}
                  />
                }
              />
            </div>
          ))}
        </Body>
      )}
    </ThemeConsumer>
  );
};

export default CheckboxGrid;
