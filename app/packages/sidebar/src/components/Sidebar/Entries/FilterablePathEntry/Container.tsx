import { cssVar } from "@voxel51/voodo";
import styled from "styled-components";
import { filterArea } from "../../../Filters/styles";

export default styled.div`
  color: ${cssVar.color.text.secondary};
  ${filterArea}
  position: relative;
`;
