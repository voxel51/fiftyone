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
