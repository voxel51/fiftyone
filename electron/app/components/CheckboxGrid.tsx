import React from "react";
import styled from "styled-components";
import { Checkbox, FormControlLabel } from "@material-ui/core";

const Body = styled.div`
  vertical-align: middle;

  label {
    width: 100%;
    margin-right: 0;

    .MuiTypography-body1 {
      font-size: unset;
    }

    .MuiFormControlLabel-label {
      width: 100%;

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
            control={
              <Checkbox
                checked={entry.selected}
                onChange={() => handleCheck(entry)}
                style={{ color: entry.color }}
              />
            }
          />
        </div>
      ))}
    </Body>
  );
};

export default CheckboxGrid;
