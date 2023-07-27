import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";

import { useRecoilValue } from "recoil";
import { SampleWrapper } from "./Sample";

const PluginWrapper = () => {
  const groupId = useRecoilValue(fos.groupId);
  const { sample } = useRecoilValue(fos.modalSample);

  const [plugin] = usePlugin(PluginComponentType.Visualizer);
  const dataset = useRecoilValue(fos.dataset);

  const pluginAPI = useMemo(
    () => ({
      dataset,
    }),
    [dataset]
  );

  return (
    <plugin.component
      // use group id in group model sample filepath in non-group mode to force a remount when switching between samples
      key={groupId ?? sample.filepath}
      api={pluginAPI}
    />
  );
};

export const Sample3d: React.FC = () => {
  return (
    <SampleWrapper>
      <PluginWrapper />
    </SampleWrapper>
  );
};
