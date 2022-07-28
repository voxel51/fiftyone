import React, { Suspense, useEffect } from "react";
import styled from "styled-components";

import { Resizable } from "re-resizable";

import { useTheme } from "@fiftyone/components";
import {
  PreloadedQuery,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import {
  paginateGroupPinnedSample_query$key,
  paginateGroup,
  paginateGroupQuery,
  pageinateGroupPinnedSampleFragment,
  paginateGroupPaginationFragment,
  paginateGroupQuery$data,
  paginateGroup_query$key,
} from "@fiftyone/relay";
import * as fos from "@fiftyone/state";

const Container = styled.div`
  position: relative;

  height: 100%;
  width: 100%;
`;
import { useActivePlugins, PluginComponentType } from "@fiftyone/plugins";
import { useRecoilState, useRecoilValue } from "recoil";
import SidebarSourceSelector from "../SidebarSourceSelector";

function usePinnedVisualizerPlugin(fragmentRef) {
  const [resolvedSample, setResolvedSample] = useRecoilState(
    fos.resolvedPinnedSample
  );
  const { data, hasNext, loadNext } = usePaginationFragment(
    paginateGroupPaginationFragment,
    fragmentRef
  );
  const { samples } = data;
  const {
    node: { sample },
  } = samples.edges.find(({ node: { sample } }) => {
    return sample._media_type === "point-cloud";
  });
  useEffect(() => {
    setResolvedSample(sample);
  }, [sample]);
  const dataset = useRecoilValue(fos.dataset);
  const [visualizerPlugin] = useActivePlugins(PluginComponentType.Visualizer, {
    dataset,
    sample,
    pinned: true,
  });
  if (visualizerPlugin) return visualizerPlugin.component;
}

const LookerContainer: React.FC<{
  fragmentRef: paginateGroup_query$key;
}> = ({ fragmentRef }) => {
  const Visualizer = usePinnedVisualizerPlugin(fragmentRef);

  return (
    <SidebarSourceSelector id="pinned">
      <Visualizer />
    </SidebarSourceSelector>
  );
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
          <LookerContainer fragmentRef={data} />
        </Suspense>
      </Container>
    </Resizable>
  );
};

export default React.memo(PinnedLooker);
