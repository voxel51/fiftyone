import styled from "styled-components";

export const BaseStylesProvider = styled.div`
  color: var(--fo-palette-text-primary);
  font-family: "Palanquin", sans-serif;
  font-size: 14px;

  input {
    color: var(--fo-palette-text-primary);
  }
`;

export const PaletteContentContainer = styled.div`
  max-width: 90vw;
  width: 500px;
  min-width: 50vw;
`;
