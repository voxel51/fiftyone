import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import {
  getSampleSrc,
  modal,
  selectedMediaField,
  useOnSelectLabel,
} from "@fiftyone/state";
import React, { Suspense } from "react";

import { Loading } from "@fiftyone/components";
import { useRecoilValue } from "recoil";

const MyPluggableSample = () => {
  const data = useRecoilValue(modal);

  if (!data) {
    throw new Error("no data");
  }
  const { sample, urls } = data;
  const mediaField = useRecoilValue(selectedMediaField(true));

  const [plugin] = usePlugin(PluginComponentType.Visualizer);
  const onSelectLabel = useOnSelectLabel();

  const pluginAPI = {
    dataset: useRecoilValue(fos.dataset),
    sample: sample,
    onSelectLabel,
    useState: useRecoilValue,
    state: fos,
    mediaFieldValue: urls[mediaField],
    mediaField,
    src: getSampleSrc(urls[mediaField]),
  };

  const pluginIsActive = plugin && plugin.activator(pluginAPI);
  const PluginComponent = pluginIsActive && plugin.component;

  return pluginIsActive ? (
    <PluginComponent key={sample._id} api={pluginAPI} />
  ) : (
    <Component {...props} />
  );
};

const Sample3d: React.FC = () => {
  return (
    <>
      <Suspense fallback={<Loading>Pixelating...</Loading>}>
        <MyPluggableSample />
      </Suspense>
    </>
  );
};

export default Sample3d;
