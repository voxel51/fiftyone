import styled from "styled-components";
import { Box as MuiBox } from "@mui/material";

const ColoredDot = styled(MuiBox)<{ color: string }>`
  background: ${({ color }) => color};
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 0.5rem;
  margin-left: 0.25rem;
`;

export default ColoredDot;
