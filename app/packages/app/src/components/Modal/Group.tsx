import { group, groupSample, groupSampleActive } from "./Group.module.css";

import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { modal, useClearModal, useOnSelectLabel } from "@fiftyone/state";
import React, { useRef } from "react";
import { PreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import GroupList from "../Group";
import Sample from "./Sample";
import classNames from "classnames";
import { GroupSampleBar } from "./Bars";
import { VideoLooker } from "@fiftyone/looker";
import Looker from "./Looker";

const withDualSample = () => {};

const GroupSample: React.FC<
  React.PropsWithChildren<{
    sampleId: string;
    pinned: boolean;
    visibleBar: boolean;
  }>
> = ({ children, pinned, sampleId, visibleBar }) => {
  return (
    <div
      className={
        pinned ? classNames(groupSample, groupSampleActive) : groupSample
      }
    >
      {children}
      {visibleBar && <GroupSampleBar sampleId={sampleId} pinned={pinned} />}
    </div>
  );
};

const MainSample = () => {
  const data = useRecoilValue(modal);

  if (!data) {
    throw new Error("no data");
  }

  const lookerRef = useRef<VideoLooker>();

  const {
    sample: { _id },
    navigation,
  } = data;
  const clearModal = useClearModal();

  const options = fos.useLookerOptions(true);

  return (
    <GroupSample
      sampleId={_id}
      pinned={true}
      visibleBar={Boolean(options.showControls)}
    >
      <Looker
        key={_id}
        lookerRef={lookerRef}
        onNext={() => navigation.getIndex(navigation.index + 1)}
        onClose={clearModal}
        onPrevious={
          navigation.index > 0
            ? () => navigation.getIndex(navigation.index - 1)
            : undefined
        }
      />
    </GroupSample>
  );
};

const PluginSample = (
  queryRef: paginateGroupPinnedSample_query$key
): React.ReactNode | null => {
  const [plugin] = usePlugin(PluginComponentType.Visualizer);
  const onSelectLabel = useOnSelectLabel();
  const pluginAPI = {
    getSampleSrc: fos.getSampleSrc,
    sample,
    onSelectLabel,
    useState: useRecoilValue,
    state: fos,
    dataset: useRecoilValue(fos.dataset),
  };
  const pluginIsActive = plugin && plugin.activator(pluginAPI);
  const PluginComponent = pluginIsActive && plugin.component;
  return PluginComponent ? (
    <GroupSample sampleId={}>
      <PluginComponent api={pluginAPI} />
    </GroupSample>
  ) : null;
};

const DualView: React.FC<{
  queryRef: PreloadedQuery<foq.paginateGroupQuery>;
}> = () => {
  return (
    <div className={group}>
      {Plugin ? <MainSample /> : <Sample />}
      {Plugin}
    </div>
  );
};

const Group: React.FC<{ queryRef: PreloadedQuery<foq.paginateGroupQuery> }> = ({
  queryRef,
}) => {
  const Plugin = usePluginSample(queryRef);

  return (
    <>
      <GroupList queryRef={queryRef} />
    </>
  );
};

export default Group;
