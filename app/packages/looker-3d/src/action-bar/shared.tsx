import { ActionPopOverDiv, ActionPopOverInner } from "../containers";

export const ActionPopOver = (props: { children: React.ReactNode }) => {
  const { children } = props;

  return (
    <ActionPopOverDiv>
      <ActionPopOverInner>{children}</ActionPopOverInner>
    </ActionPopOverDiv>
  );
};
