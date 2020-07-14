import React from "react";
import styled from "styled-components";

const Body = styled.div`
  display: grid;
  grid-template-columns: repeat(${({ dataColumns }) => dataColumns + 1}, auto);

  input {
    margin-right: 6px;
  }
`;

type Entry = {
  name: string;
  selected: boolean;
  data: Array;
};

type Props = {
  entries: Entry[];
};

export default ({ entries }: Props) => {
  const dataColumns = Math.max(...entries.map((e) => e.data.length));
  const dataIndices = Array.from({ length: dataColumns }).map((_, i) => i);
  return (
    <Body dataColumns={dataColumns}>
      {entries.map((entry) => (
        <React.Fragment key={entry.name}>
          <label>
            <input type="checkbox" checked={entry.selected} />
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
