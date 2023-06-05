export const scrollbarStyles = ({ theme }) => `
::-webkit-scrollbar {
  width: 16px;
}

scrollbar-color: ${({ theme }) => theme.text.tertiary} ${({ theme }) =>
  theme.background.body};

  scrollbar-gutter: auto;

  scrollbar-width: auto;

::-webkit-scrollbar-track {
  border: solid 4px transparent ${theme.text.tertiary};
}

@-moz-document url-prefix() {
  padding-right: 16px;
}

::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px transparent;
  border: solid 4px transparent;
  border-radius: 16px;
  transition: box-shadow linear 0.5s;
}
&:hover::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px ${theme.text.tertiary};
}
`;
