import { Loading } from "@fiftyone/components";
import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense, useMemo } from "react";

import { useRecoilValue } from "recoil";

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

export const Sample3d = () => {
  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <PluginWrapper />
    </Suspense>
  );
};
