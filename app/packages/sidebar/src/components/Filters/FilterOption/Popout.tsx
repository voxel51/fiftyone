import { useOutsideClick } from "@fiftyone/state";
import { cssVar } from "@voxel51/voodo";
import React from "react";
import styled from "styled-components";

const Panel = styled.div`
  position: relative;
  margin-top: 0.6rem;
  min-width: 14rem;
  box-sizing: border-box;
  border: 1px solid ${cssVar.color.border.subtle};
  border-radius: 2px;
  background-color: ${cssVar.color.bg.background};
  box-shadow: 0 2px 20px ${cssVar.color.scrim.light};
  font-size: 14px;
`;

export default function ({
  children,
  close,
}: {
  close: React.MouseEventHandler;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useOutsideClick(ref, close, "click");

  return <Panel ref={ref}>{children}</Panel>;
}
