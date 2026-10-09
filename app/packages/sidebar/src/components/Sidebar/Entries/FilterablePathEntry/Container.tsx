import { cssVar } from "@voxel51/voodo";
import styled from "styled-components";

export default styled.div`
  background: ${cssVar.color.bg.background};
  border: 1px solid ${cssVar.color.border.default};
  border-radius: 2px;
  color: ${cssVar.color.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  position: relative;
`;
