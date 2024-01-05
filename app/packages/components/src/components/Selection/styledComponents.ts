import styled from "styled-components";
import { Box as MuiBox } from "@mui/material";

export const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;

export const TextContainer = styled.div`
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.text.primary};
`;

export const EditBox = styled(Box)<{
  isSelected?: boolean;
  isHovered?: boolean;
}>`
  position: absolute;
  display: flex;
  right: 0.5rem;
  z-index: 999;
  width: auto;
  background: ${({ theme, isSelected = false, isHovered = false }) => {
    if (isSelected && !isHovered) {
      return theme.background.level2;
    }
    return "inherit";
  }};
`;

export const SearchInput = styled.input`
  width: 100%;
  margin: 0.5rem;
  border-radius: 4px;
  cursor: ${({ disabled }) =>
    disabled ? "not-allowed" : "pointer"} !important;
  padding: 1.25rem 0.5rem;
  color: ${({ theme }) => theme.text.primary};
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  height: 30px;

  &:focus {
    border: 1px solid ${({ theme }) => theme.primary.softBorder};
    outline: none;
  }
`;

export const RowLabelContainer = styled(MuiBox)`
  width: 100%;
  display: flex;
  align-items: center;
`;

export const SelectionRow = styled(MuiBox)`
  position: relative;
  display: flex;
  padding: 0.25rem 0.5rem;
  width: 100%;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.primary.plainBorder};

  &:hover {
    cursor: pointer;
    background: ${({ theme }) => theme.background.level1};
  }
`;

export const CustomBox = styled(MuiBox)`
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const CustomSearchBox = styled(CustomBox)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  zindex: 9999;
  background: ${({ theme }) => theme.background.level3};
`;

export const ViewContainer = styled(MuiBox)<{ width?: string }>`
  display: flex;
  flex-direction: column;
  max-height: 400px;
  width: ${({ width = "270px" }) => width};
  overflow-y: auto;
  background: ${({ theme }) => theme.background.level2};
`;

export const LastOption = styled(MuiBox)<{ disabled: boolean }>`
  border-top: 1px solid ${({ theme }) => theme.primary.plainBorder} !important;
  position: sticky !important;
  bottom: 0;
  padding: 0.25rem;
  width: 100%;
  background: ${({ disabled, theme }) =>
    disabled ? theme.background.body : theme.background.level1} !important;
  z-index: 999;
  display: flex;

  &:hover {
    background: ${({ disabled, theme }) =>
      disabled ? "none" : theme.background.level2} !important;
  }
`;

export const ColoredDot = styled(MuiBox)<{ color: string }>`
  background: ${({ color }) => color};
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 0.5rem;
  margin-left: 0.25rem;
`;
