import React from "react";
import { animated } from "@react-spring/web";
import styled from "styled-components";

import { scrollbarStyles } from "../utils";
import { Resizable } from "re-resizable";

import { useTheme } from "@fiftyone/components";
import { useFragment } from "react-relay";
import {
  pageinateGroupPinnedSampleFragment,
  pag,
  paginateGroupPinnedSample_query$key,
} from "@fiftyone/relay";

const Container = styled.div`
  position: relative;

  height: 100%;
  width: 100%;
`;

const PinnedLooker: React.FC<
  React.PropsWithChildren<{
    pinnedSampleFragment: paginateGroupPinnedSample_query$key;
  }>
> = ({ children, pinnedSampleFragment }) => {
  const theme = useTheme();
  const { sample } = useFragment(
    pageinateGroupPinnedSampleFragment,
    pinnedSampleFragment
  );

  const [width, setWidth] = React.useState(400);
  const shown = true;
  return (
    <Resizable
      size={{ height: "100%", width }}
      minWidth={200}
      maxWidth={600}
      enable={{
        top: false,
        right: true,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, { width: delta }) => {
        setWidth(width + delta);
      }}
      style={{
        borderRight: `1px solid ${theme.backgroundDarkBorder}`,
      }}
    >
      <Container>{children}</Container>
    </Resizable>
  );
};

export default React.memo(PinnedLooker);
