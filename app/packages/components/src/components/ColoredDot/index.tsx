import styled from "styled-components";
import { Box as MuiBox } from "@mui/material";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
const ColoredDot = styled(MuiBox)<{ color: string }>`
  background: ${({ color }) => color};
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 0.5rem;
  margin-left: 0.25rem;
`;

export default ColoredDot;
