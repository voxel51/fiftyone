import React from "react";
import styled from "styled-components";

const Body = styled.div`
  display: grid;
  grid-template-columns: ${({ columnWidths }) =>
    columnWidths.map((c) => c + "fr").join(" ")};
  vertical-align: middle;

  > label,
  > span {
    line-height: 1.5em;
  }

  input {
    vertical-align: middle;
    margin-top: 0;
    margin-bottom: 3px;
    margin-right: 6px;
  }
`;

export type Entry = {
  name: string;
  selected: boolean;
  data: Array;
};

type Props = {
  entries: Entry[];
  onCheck: (entry: Entry) => void;
  columnWidths: number[];
};

export default ({ entries, onCheck, columnWidths = [] }: Props) => {
  const dataColumns = Math.max(...entries.map((e) => e.data.length));
  const dataIndices = Array.from({ length: dataColumns }).map((_, i) => i);
  const allColumnWidths = Array.from({ length: dataColumns + 1 }).map(
    (_, i) => columnWidths[i] || 1
  );

  const handleCheck = (entry) => {
    if (onCheck) {
      onCheck({ ...entry, selected: !entry.selected });
    }
  };

  return (
    <Body columnWidths={allColumnWidths}>
      {entries.map((entry) => (
        <React.Fragment key={entry.name}>
          <label>
            <input
              type="checkbox"
              checked={entry.selected}
              onChange={() => handleCheck(entry)}
            />
            <span>{entry.name}</span>
          </label>
          {dataIndices.map((i) => (
            <span key={i}>{entry.data[i]}</span>
          ))}
        </React.Fragment>
      ))}
    </Body>
  );
};
