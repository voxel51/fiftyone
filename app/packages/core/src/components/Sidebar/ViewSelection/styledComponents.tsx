import { Add } from "@mui/icons-material";
import styled from "styled-components";

export const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

export const LastOption = styled(Box)<{ disabled?: boolean }>`
  color: ${({ disabled, theme }) =>
    disabled ? theme.text.tertiary : theme.text.primary} !important;

  cursor: ${({ disabled }) =>
    disabled ? "not-allowed" : "pointer"} !important;

  &:hover {
    background: ${({ disabled, theme }) =>
      disabled ? theme.background.level1 : theme.background.level2} !important;
  }
`;

export const AddIcon = styled(Add)<{ disabled?: boolean }>`
  color: ${(props) =>
    props.disabled
      ? ({ theme }) => theme.text.tertiary
      : ({ theme }) => theme.text.primary} !important;
`;

export const TextContainer = styled.div<{ disabled?: boolean }>`
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
  text-overflow: ellipsis;
  color: ${({ disabled, theme }) =>
    disabled ? theme.text.tertiary : theme.text.primary} !important;
`;
