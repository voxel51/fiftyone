import { LoadingDots } from "@fiftyone/components";
import { Add, Remove } from "@mui/icons-material";
import React from "react";
import styled, { useTheme } from "styled-components";
import { Column } from "./Components";
import { Container } from "./Icons";
import { IconProps } from "@mui/material";
import {
  useAnnotationLabelCount,
  useAnnotationSelector,
  useLabelsExpandedState,
  usePrimitivesCount,
  usePrimitivesExpandedState,
} from "./redux/hooks";

const PlusMinusButton = (props: PlusMinusButtonProps) => {
  const { expanded, toggle, ...otherProps } = props;
  const Component = expanded ? Remove : Add;

  return <Component onClick={toggle} {...otherProps} />;
};

const GroupHeader = styled.div`
  border-radius: var(--radius-xs);
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
  text-transform: uppercase;
`;

const Round = styled.div`
  align-items: center;
  border-radius: var(--radius-full);
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

export const LABELS_GROUP_NAME = "Labels";
export const PRIMITIVES_GROUP_NAME = "PRIMITIVES";

const Toggle = ({ name }: { name: string }) => {
  const [labelsExpanded, setLabelsExpanded] = useLabelsExpandedState();
  const [primitivesExpanded, setPrimitivesExpanded] = usePrimitivesExpandedState();

  const isLabels = name === LABELS_GROUP_NAME;
  const expanded = isLabels ? labelsExpanded : primitivesExpanded;
  const setExpanded = isLabels ? setLabelsExpanded : setPrimitivesExpanded;

  return (
    <Round>
      <PlusMinusButton
        expanded={expanded}
        toggle={() => setExpanded(!expanded)}
        data-cy={`sidebar-group-${name}-toggle`}
      />
    </Round>
  );
};

const Group = React.memo(({ name }: { name: string }) => {
  const theme = useTheme();
  const labelsCount = useAnnotationLabelCount();
  const primCount = usePrimitivesCount();
  const count = name === LABELS_GROUP_NAME ? labelsCount : primCount;

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
            <Container data-cy={`sidebar-group-${name}-field-count`}>
              {count === null ? <LoadingDots /> : count}
            </Container>
            <Toggle name={name} />
          </Column>
        </GroupHeader>
      </div>
    </div>
  );
});

export default Group;

type PlusMinusButtonProps = IconProps & {
  expanded: boolean;
  toggle: () => void;
};
