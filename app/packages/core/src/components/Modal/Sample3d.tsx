import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import {
  getSampleSrc,
  modal,
  selectedMediaField,
  useOnSelectLabel,
} from "@fiftyone/state";
import React, { Suspense, useMemo } from "react";

import { Loading } from "@fiftyone/components";
import { useRecoilValue } from "recoil";

const PluggableSample = () => {
  const data = useRecoilValue(modal);

  if (!data) {
    throw new Error("no data");
  }

  const { sample, urls } = data;

  const mediaField = useRecoilValue(selectedMediaField(true));
  const [plugin] = usePlugin(PluginComponentType.Visualizer);
  const onSelectLabel = useOnSelectLabel();
  const dataset = useRecoilValue(fos.dataset);

  const pluginAPI = useMemo(
    () => ({
      dataset,
      mediaField,
      onSelectLabel,
      sample,
      mediaFieldValue: urls[mediaField],
      src: getSampleSrc(urls[mediaField]),
      state: fos,
      useState: useRecoilValue,
    }),
    [dataset, sample, mediaField, onSelectLabel, urls]
  );

  const isPluginActive = plugin && plugin.activator(pluginAPI);

  return isPluginActive ? (
    <plugin.component key={sample._id} api={pluginAPI} />
  ) : null;
};

const Sample3d: React.FC = () => {
  return (
    <>
      <Suspense fallback={<Loading>Pixelating...</Loading>}>
        <PluggableSample />
      </Suspense>
    </>
  );
};

export default Sample3d;
