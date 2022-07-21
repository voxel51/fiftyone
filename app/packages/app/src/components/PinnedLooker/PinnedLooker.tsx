import React, { Suspense } from "react";
import styled from "styled-components";

import { Resizable } from "re-resizable";

import { useTheme } from "@fiftyone/components";
import { PreloadedQuery, useFragment, usePreloadedQuery } from "react-relay";
import {
  paginateGroupPinnedSample_query$key,
  paginateGroup,
  paginateGroupQuery,
  pageinateGroupPinnedSampleFragment,
} from "@fiftyone/relay";

const Container = styled.div`
  position: relative;

  height: 100%;
  width: 100%;
`;

const LookerContainer: React.FC<{
  data: paginateGroupPinnedSample_query$key;
}> = ({ data }) => {
  const { sample } = useFragment(pageinateGroupPinnedSampleFragment, data);

  return <div>{sample?.__typename}</div>;
};

const PinnedLooker: React.FC<
  React.PropsWithChildren<{
    queryRef: PreloadedQuery<paginateGroupQuery>;
  }>
> = ({ children, queryRef }) => {
  const theme = useTheme();
  const data = usePreloadedQuery(paginateGroup, queryRef);

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
        left: true,
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
      <Container>
        <Suspense>
          <LookerContainer data={data} />
        </Suspense>
      </Container>
    </Resizable>
  );
};

export default React.memo(PinnedLooker);
