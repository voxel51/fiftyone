import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense, useMemo } from "react";

import { Loading } from "@fiftyone/components";
import { useRecoilValue } from "recoil";

const PluginWrapper = () => {
  const groupId = useRecoilValue(fos.groupId);
  const { sample } = useRecoilValue(fos.modalSample);

  const dataset = useRecoilValue(fos.dataset);
  const plugin = useActivePlugins(PluginComponentType.Visualizer, {
    dataset,
  }).pop();

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
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <PluginWrapper />
    </Suspense>
  );
};
