export const TextEntry = ({ text }: { text: string }) => {
  const theme = useTheme();
  return (
    <Container
      style={{ color: theme.fontDarkest, background: theme.backgroundLight }}
      title={text}
    >
      <Header>
        <span>{text}</span>
      </Header>
    </Container>
  );
};
