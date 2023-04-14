import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense, useMemo } from "react";

import { Loading } from "@fiftyone/components";
import { useRecoilValue } from "recoil";

const PluginWrapper = () => {
  // if (!data) {
  //   throw new Error("no data");
  // }

  // const { sample, urls } = data;
  const groupId = useRecoilValue(fos.groupId);

  // const mediaField = useRecoilValue(selectedMediaField(true));
  const [plugin] = usePlugin(PluginComponentType.Visualizer);
  // const onSelectLabel = useOnSelectLabel();
  const dataset = useRecoilValue(fos.dataset);

  const pluginAPI = useMemo(
    () => ({
      dataset,
      // mediaField,
      // onSelectLabel,
      // mediaFieldValue: urls[mediaField],
      // src: getSampleSrc(urls[mediaField]),
      // state: fos,
      // useState: useRecoilValue,
    }),
    [dataset]
  );

  return <plugin.component key={groupId} api={pluginAPI} />;
};

export const Sample3d: React.FC = () => {
  return (
    <>
      <Suspense fallback={<Loading>Pixelating...</Loading>}>
        <PluginWrapper />
      </Suspense>
    </>
  );
};
