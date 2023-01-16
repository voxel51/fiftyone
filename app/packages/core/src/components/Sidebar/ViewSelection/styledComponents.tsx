import { Add } from "@mui/icons-material";
import styled from "styled-components";

export const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

export const ErrorBox = styled(Box)`
  color: ${({ theme }) => theme.error.main};
  justify-content: flex-start;
`;

export const LastOption = styled(Box)<{ disabled?: boolean }>`
  color: ${({ disabled, theme }) =>
    disabled ? theme.text.tertiary : theme.text.primary} !important;

  cursor: ${({ disabled }) =>
    disabled ? "not-allowed" : "pointer"} !important;

  &:hover {
    background: ${({ disabled, theme }) =>
      disabled ? "none" : theme.background.level2} !important;
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

export const ErrorText = styled(Box)`
  color: ${({ theme }) => theme.error.main};
`;

export const SecondaryContainer = styled(TextContainer)`
  color: ${({ theme }) => theme.text.secondary} !important;
`;

export const DialogBody = styled(Box)`
  flex-direction: column;
  width: 500px;
`;

export const InputContainer = styled(Box)`
  flex-direction: column;
  padding: 0.5rem 0;
`;

export const Label = styled(SecondaryContainer)`
  font-size: 1rem;
`;

export const DescriptionInput = styled.textarea`
  resize: none;
  width: 100%;
  margin: 0.5rem 0.75rem;
  border-radius: 4px;
  padding: 0.5rem;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  color: ${({ theme }) => theme.text.primary};
  background: ${({ theme }) => theme.background.level3};
  font-family: "Palanquin", sans-serif;

  &:focus {
    border: 1px solid ${({ theme }) => theme.primary.plainBorder};
    outline: none;
  }
`;

export const NameInput = styled.input<{ error?: string }>`
  width: 100%;
  margin: ${({ error }) => (error ? "0.25rem 0.75rem" : "0.5rem 0.75rem")};
  border-radius: 4px;
  border: 1px solid
    ${({ theme, error }) =>
      error ? theme.error.main : theme.primary.plainBorder};
  padding: 0.5rem;
  color: ${({ theme }) => theme.text.primary};
  background: ${({ theme }) => theme.background.level3};
  font-family: "Palanquin", sans-serif;

  &:focus {
    border: 1px solid ${({ theme }) => theme.primary.plainBorder};
    outline: none;
  }
`;
