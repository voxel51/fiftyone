import React, { useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import { sidebarEntries, sidebarGroupNames } from "../recoil";
import { EntryKind } from "../utils";

const AddGroupDiv = styled.div`
  box-sizing: border-box;
  background-color: transparent;
  cursor: pointer;
  font-weight: bold;
  user-select: none;
  padding-top: 2px;

  display: flex;
  justify-content: space-between;

  & > input {
    color: ${({ theme }) => theme.fontDark};
    font-size: 14px !important;
    font-size: 1rem;
    width: 100%;
    background: transparent;
    box-shadow: none;
    border: none;
    outline: none;
    border-bottom: 2px solid ${({ theme }) => theme.backgroundLight};
    text-transform: uppercase;
    font-weight: bold;
    padding: 3px;
  }
`;

const AddGroup = () => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(false));
  const [value, setValue] = useState("");
  const currentGroups = useRecoilValue(sidebarGroupNames(false));

  return (
    <AddGroupDiv>
      <input
        type={"text"}
        placeholder={"+ add group"}
        value={value}
        maxLength={140}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length) {
            if (!currentGroups.includes(value)) {
              const newEntries = [...entries];
              newEntries.splice(entries.length - 1, 0, {
                kind: EntryKind.GROUP,
                name: value,
              });

              setEntries(newEntries);
              setValue("");
            } else {
              alert(`${value.toUpperCase()} is already a group name`);
            }
          }
        }}
      />
    </AddGroupDiv>
  );
};

export default React.memo(AddGroup);
