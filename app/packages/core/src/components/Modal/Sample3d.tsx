import { Loading } from "@fiftyone/components";
import { AbstractLooker } from "@fiftyone/looker";
import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense, useRef } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { SampleWrapper } from "./Sample";

const Sample3dContiner = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;

const Looker3dPluginWrapper = () => {
  const groupId = useRecoilValue(fos.groupId);
  const modal = useRecoilValue(fos.currentModalSample);

  const dataset = useRecoilValue(fos.dataset);
  const plugin = useActivePlugins(PluginComponentType.Visualizer, {
    dataset,
  }).pop();

  const pluginAPI = React.useMemo(
    () => ({
      dataset,
    }),
    [dataset]
  );

  return (
    <plugin.component
      // use group id in group model sample filepath in non-group mode to force a remount when switching between samples
      key={groupId ?? modal?.index}
      api={pluginAPI}
    />
  );
};

export const Sample3d = () => {
  const lookerRef = useRef<AbstractLooker | undefined>(undefined);

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <Sample3dContiner data-cy="modal-looker-container">
        <SampleWrapper lookerRef={lookerRef}>
          <Looker3dPluginWrapper />
        </SampleWrapper>
      </Sample3dContiner>
    </Suspense>
  );
};
