import type React from "react";
import { forwardRef } from "react";
import { ActionPopOverDiv, ActionPopOverInner } from "../containers";

export const ActionPopOver = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>((props, ref) => {
  const { children } = props;

  return (
    <ActionPopOverDiv ref={ref}>
      <ActionPopOverInner>{children}</ActionPopOverInner>
    </ActionPopOverDiv>
  );
});
