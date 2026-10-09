import { cssVar } from "@voxel51/voodo";
import styled from "styled-components";

export const ItemAction = styled.div`
  cursor: pointer;
  margin: 0 -0.5rem;
  padding: 0.25rem 0.5rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  text-decoration: none;
  white-space: no-wrap;
  color: ${cssVar.color.text.secondary};
`;
