import { Selector, useTheme } from "@fiftyone/components";
import { pathColor } from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  column-gap: 1rem;
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

const Box = ({ path, placeholder }: { path: string; placeholder: string }) => {
  const color = useRecoilValue(pathColor(path));
  const theme = useTheme();
  return (
    <Selector
      placeholder={placeholder}
      inputStyle={{
        color: theme.text.secondary,
        fontSize: "1rem",
        width: "100%",
      }}
      onSelect={() => alert("E")}
      containerStyle={{ borderBottomColor: color, zIndex: 1000 }}
    />
  );
};

const Boxes = ({ path }: { path: string }) => {
  return (
    <Container>
      <Box path={path} placeholder={"min"} />
      <Box path={path} placeholder={"max"} />
    </Container>
  );
};

export default Boxes;
