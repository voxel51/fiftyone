import { cssVar } from "@voxel51/voodo";
import styled from "styled-components";

export const InputDiv = styled.div`
  box-sizing: border-box;
  cursor: pointer;
  font-weight: bold;
  user-select: none;
  padding-top: 2px;
  margin: 0 0.25rem 0 1rem;

  display: flex;
  justify-content: space-between;
  & > input {
    color: ${cssVar.color.text.secondary};
    font-size: 1rem;
    width: 100%;
    background: transparent;
    box-shadow: none;
    border: none;
    outline: none;
    border-bottom: 2px solid ${cssVar.color.bg["card-elevated"]};
    font-weight: bold;
    padding: 3px;
  }
`;

/** Compact dropdown for the sidebar header row (mode + schema lens). */
export const FilterInputDiv = styled.div`
  background: ${cssVar.color.bg.card};
  box-sizing: border-box;
  cursor: pointer;
  font-weight: bold;
  user-select: none;
  padding 2px 1rem 0.25rem 1rem;

  display: flex;
  justify-content: space-between;

  & > input {
    color: ${cssVar.color.text.secondary};
    font-size: 14px !important;
    font-size: 1rem;
    width: 100%;
    background: transparent;
    box-shadow: none;
    border: none;
    outline: none;
    border-bottom: 2px solid ${cssVar.color.bg["card-elevated"]};
    font-weight: bold;
    padding: 3px;
  }
`;
