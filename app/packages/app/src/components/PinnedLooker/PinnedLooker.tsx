import React, { useCallback, useRef, useState } from "react";
import { animated, Controller, config } from "@react-spring/web";
import styled from "styled-components";

import { move } from "@fiftyone/utilities";

import { useEventHandler } from "../../utils/hooks";
import { scrollbarStyles } from "../utils";
import { Resizable } from "re-resizable";
import { useRecoilState, useRecoilValue } from "recoil";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";

const MARGIN = 3;

const Column = styled.div`
  position: relative;
  max-height: 100%;
  height: 100%;
  width: 100%;

  overflow-y: scroll;
  overflow-x: hidden;

  scrollbar-color: ${({ theme }) => theme.fontDarkest}
    ${({ theme }) => theme.background};
  background: ${({ theme }) => theme.background};
  ${scrollbarStyles}
`;

const Container = animated(styled.div`
  position: relative;
  min-height: 100%;
  margin: 0 0.25rem 0 1.25rem;
  height: 100%;

  & > div {
    position: absolute;
    transform-origin: 50% 50% 0px;
    touch-action: none;
    width: 100%;
  }
`);

type RenderEntry = (
  key: string,
  group: string,
  entry: fos.SidebarEntry,
  controller: Controller,
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void
) => { children: React.ReactNode; disabled: boolean };

const PinnedLooker = ({
  modal,
  children,
}: {
  render: RenderEntry;
  modal: boolean;
}) => {
  const theme = useTheme();
  const [width, setWidth] = React.useState(400);
  const shown = true;
  return shown ? (
    <Resizable
      size={{ height: "100%", width }}
      minWidth={200}
      maxWidth={600}
      enable={{
        top: false,
        right: !modal,
        bottom: false,
        left: modal,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, { width: delta }) => {
        setWidth(width + delta);
      }}
      style={{
        borderLeft: modal
          ? `1px solid ${theme.backgroundDarkBorder}`
          : undefined,
        borderRight: !modal
          ? `1px solid ${theme.backgroundDarkBorder}`
          : undefined,
      }}
    >
      <Column>
        <Container>{children}</Container>
      </Column>
    </Resizable>
  ) : null;
};

export default React.memo(PinnedLooker);
