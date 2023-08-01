import { Loading } from "@fiftyone/components";
import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";

const PluginWrapper = () => {
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
  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <PluginWrapper />
    </Suspense>
  );
};
