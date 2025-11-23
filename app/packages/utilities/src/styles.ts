import styled from "styled-components";

export const scrollbarStyles = `
--scrollbar-color: var(--fo-palette-text-tertiary);

@-moz-document url-prefix() {
  & {
    scrollbar-color: var(--scrollbar-color) transparent;
    scrollbar-width: thin;
  }
}

&::-webkit-scrollbar {
  height: 14px;
  width: 14px;
}

&::-webkit-scrollbar-corner {
  background: transparent;
}

&::-webkit-scrollbar-track {
  box-shadow: inset 0 0 14px 14px transparent;
  height: 14px;
  width: 14px;
}

&::-webkit-scrollbar-thumb {
  border: solid 3px transparent;
  border-radius: 0;
  box-shadow: inset 0 0 8px 8px var(--scrollbar-color);
}
`;

export const DateTimeInputContainer = styled.div`
  font-size: 14px;
  border-bottom: 1px ${({ theme }) => theme.primary.plainColor} solid;
  position: relative;
  margin: 0.5rem 0;
  max-width: calc(50% - 0.5rem);
`;

export const DateTimeInput = styled.input`
  &::-webkit-calendar-picker-indicator {
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" viewBox="0 0 24 24"><path fill="${({
      theme,
    }) =>
      theme.text
        .secondary}" d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/></svg>');
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* Firefox */
  &[type="number"] {
    -moz-appearance: textfield;
  }

  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.text.secondary};
  height: 2rem;
  border: none;
  align-items: center;
  font-weight: bold;
  width: 100%;

  &:focus {
    border: none;
    outline: none;
    font-weight: bold;
  }

  &::placeholder {
    color: ${({ theme }) => theme.text.secondary};
    font-weight: bold;
  }
`;
