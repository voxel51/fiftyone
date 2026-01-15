import { LoadingDots } from "@fiftyone/components";
import { Add, Remove } from "@mui/icons-material";
import { atom, useAtom, useAtomValue } from "jotai";
import React from "react";
import styled, { useTheme } from "styled-components";
import { Column } from "./Components";
import { Container } from "./Icons";
import { labels } from "./useLabels";

const PlusMinusButton = ({
  expanded,
  toggle,
}: {
  expanded: boolean;
  toggle: () => void;
}) => {
  const Component = expanded ? Remove : Add;

  return <Component onClick={toggle} />;
};

const GroupHeader = styled.div`
  border-radius: 3px;
  padding: 0.5rem;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  align-items: center;
  font-weight: bold;
  color: ${({ theme }) => theme.text.secondary};
  background: ${({ theme }) => theme.neutral.softBg};
  user-select: text;

  svg {
    font-size: 1.25em;
    vertical-align: middle;
  }
  cursor: pointer;
`;

const GroupDiv = styled.div`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-weight: bold;
  color: ${({ theme }) => theme.text.secondary};
`;

const Round = styled.div`
  align-items: center;
  border-radius: 1rem;
  display: flex;
  cursor: pointer;
  flex-direction: column;
  height: 2rem;
  justify-content: center;
  padding: 0.25rem;
  width: 2rem;

  &:hover {
    background: ${({ theme }) => theme.background.level1};
  }

  &:hover path {
    fill: ${({ theme }) => theme.text.primary};
  }
`;

const Toggle = ({ name }: { name: string }) => {
  const [expanded, setExpanded] = useAtom(EXPANDED_ATOMS[name]);

  return (
    <Round>
      <PlusMinusButton
        expanded={expanded}
        toggle={() => setExpanded((cur) => !cur)}
      />
    </Round>
  );
};

export const labelsExpanded = atom(true);
export const primitivesExpanded = atom(true);

const EXPANDED_ATOMS: Record<string, typeof labelsExpanded> = {
  Labels: labelsExpanded,
  PRIMITIVES: primitivesExpanded,
};

const labelsCount = atom((get) => get(labels).length);
export const primitivesCount = atom(0);

const COUNT_ATOMS: Record<string, typeof labelsCount> = {
  Labels: labelsCount,
  PRIMITIVES: primitivesCount,
};

const Group = React.memo(({ name }: { name: string }) => {
  const theme = useTheme();
  const count = useAtomValue(COUNT_ATOMS[name]);

  return (
    <div
      style={{
        boxShadow: `0 2px 20px ${theme.custom.shadow}`,
      }}
    >
      <div style={{ position: "relative", cursor: "pointer" }}>
        <GroupHeader title={name}>
          <GroupDiv
            style={{
              flexGrow: 1,
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </GroupDiv>

          <Column>
            <Container>{count === null ? <LoadingDots /> : count}</Container>
            <Toggle name={name} />
          </Column>
        </GroupHeader>
      </div>
    </div>
  );
});

export default Group;
