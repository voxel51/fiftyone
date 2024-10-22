import { Selector, useTheme } from "@fiftyone/components";
import { maxAtom, minAtom, pathColor } from "@fiftyone/state";
import React from "react";
import type { RecoilState } from "recoil";
import { useRecoilState, useRecoilValue } from "recoil";
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

const Box = ({
  atom,
  color,
  placeholder,
}: {
  atom: RecoilState<number | null>;
  color: string;
  placeholder: string;
}) => {
  const [value, setValue] = useRecoilState(atom);
  const theme = useTheme();
  return (
    <Selector
      placeholder={placeholder}
      inputStyle={{
        color: theme.text.secondary,
        fontSize: "1rem",
        width: "100%",
      }}
      value={value !== null ? String(value) : undefined}
      onSelect={async (v) => {
        setValue(Number.parseFloat(v));
        return v;
      }}
      containerStyle={{ borderBottomColor: color, zIndex: 1000 }}
    />
  );
};

const Boxes = ({ path }: { path: string }) => {
  const color = useRecoilValue(pathColor(path));
  return (
    <Container>
      <Box
        atom={minAtom({ modal: true, path })}
        color={color}
        placeholder={"min"}
      />
      <Box
        atom={maxAtom({ modal: true, path })}
        color={color}
        placeholder={"max"}
      />
    </Container>
  );
};

export default Boxes;
