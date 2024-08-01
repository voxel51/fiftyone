export const scrollbarStyles = ({ theme }) => `
::-webkit-scrollbar {
  width: 14px;
}

scrollbar-color: ${({ theme }) => theme.text.tertiary} ${({ theme }) =>
  theme.background.body};

  scrollbar-gutter: auto;

  scrollbar-width: auto;

::-webkit-scrollbar-track {
  border: solid 4px transparent ${theme.text.tertiary};
}



::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px transparent;
  border: solid 3px transparent;
  border-radius: 0;
}

::-webkit-scrollbar-corner {
  background: transparent;
}

&:hover::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px ${theme.text.tertiary};
}
`;
