import { cssVar } from "@voxel51/voodo";
import styled from "styled-components";

export const NodeInfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export const NodeInfoHeader = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

export const NodeInfoBody = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 1rem;
  border: 1px solid ${cssVar.color.border.default};
  border-radius: 0.5rem;
  margin-top: 1rem;
  border-top: 1px solid ${cssVar.color.border.default};
`;
