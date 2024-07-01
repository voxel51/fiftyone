import { ActionPopOverDiv, ActionPopOverInner } from "../containers";
import React, { forwardRef } from "react";

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
