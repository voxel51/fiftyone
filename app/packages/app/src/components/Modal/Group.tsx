import {
  group,
  groupContainer,
  groupSample,
  groupSampleActive,
} from "./Group.module.css";

import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import {
  hasPinnedSlice,
  modal,
  useClearModal,
  useOnSelectLabel,
} from "@fiftyone/state";
import React, {
  MutableRefObject,
  Suspense,
  useCallback,
  useRef,
  useState,
} from "react";
import {
  PreloadedQuery,
  usePreloadedQuery,
  useRefetchableFragment,
} from "react-relay";
import { useRecoilValue } from "recoil";
import GroupList from "../Group";
import Sample from "./Sample";
import classNames from "classnames";
import { GroupBar, GroupSampleBar } from "./Bars";
import { VideoLooker } from "@fiftyone/looker";
import Looker from "./Looker";
import {
  paginateGroup,
  paginateGroupPinnedSampleFragment,
  paginateGroupPinnedSample_query$key,
} from "@fiftyone/relay";
import { Resizable } from "re-resizable";
import { Loading, useTheme } from "@fiftyone/components";

const GroupSample: React.FC<
  React.PropsWithChildren<{
    sampleId: string;
    pinned: boolean;
    visibleBar: boolean;
  }>
> = ({ children, pinned, sampleId, visibleBar }) => {
  const [hovering, setHovering] = useState(false);
  return (
    <div
      className={
        pinned ? classNames(groupSample, groupSampleActive) : groupSample
      }
    >
      {children}
      {(visibleBar || hovering) && (
        <GroupSampleBar sampleId={sampleId} pinned={pinned} />
      )}
    </div>
  );
};

const MainSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | undefined>;
}> = ({ lookerRef }) => {
  const data = useRecoilValue(modal);

  if (!data) {
    throw new Error("no data");
  }

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

const Pinned: React.FC<{
  queryRef: PreloadedQuery<foq.paginateGroupQuery>;
}> = ({ queryRef }) => {
  const data = usePreloadedQuery(paginateGroup, queryRef);
  const theme = useTheme();

  const [width, setWidth] = React.useState(400);

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
        borderLeft: `1px solid ${theme.backgroundDarkBorder}`,
      }}
    >
      <PinnedSample fragmentRef={data} />
    </Resizable>
  );
};

const withVisualizerPlugin = <
  T extends { fragmentRef: paginateGroupPinnedSample_query$key }
>(
  Component: React.FC<T>
) => {
  return (props: T) => {
    const [{ sample }] = useRefetchableFragment(
      paginateGroupPinnedSampleFragment,
      props.fragmentRef
    );

    if (sample.__typename === "%other") {
      throw new Error("bad sample");
    }
    const [plugin] = usePlugin(PluginComponentType.Visualizer);
    const onSelectLabel = useOnSelectLabel();

    const pluginAPI = {
      getSampleSrc: fos.getSampleSrc,
      sample: sample.sample,
      onSelectLabel,
      useState: useRecoilValue,
      state: fos,
      dataset: useRecoilValue(fos.dataset),
    };
    const pluginIsActive = plugin && plugin.activator(pluginAPI);
    const PluginComponent = pluginIsActive && plugin.component;

    return pluginIsActive ? (
      <PluginComponent api={pluginAPI} sampleOverride={sample.sample} />
    ) : (
      <Component {...props} />
    );
  };
};

const PluggableSample: React.FC<{
  fragmentRef: paginateGroupPinnedSample_query$key;
}> = withVisualizerPlugin(() => {
  return <Loading>No visualizer was found</Loading>;
});

const PinnedSample: React.FC<{
  fragmentRef: paginateGroupPinnedSample_query$key;
}> = ({ fragmentRef }) => {
  const [{ sample }] = useRefetchableFragment(
    paginateGroupPinnedSampleFragment,
    fragmentRef
  );

  return (
    <GroupSample sampleId={sample.sample._id} pinned={false} visibleBar={false}>
      <PluggableSample fragmentRef={fragmentRef} />
    </GroupSample>
  );
};

const DualView: React.FC<{
  queryRef: PreloadedQuery<foq.paginateGroupQuery>;
}> = ({ queryRef }) => {
  const lookerRef = useRef<VideoLooker>();

  return (
    <div className={groupContainer}>
      <GroupBar lookerRef={lookerRef} queryRef={queryRef} />
      <div className={group}>
        <MainSample lookerRef={lookerRef} />
        <Pinned queryRef={queryRef} />
      </div>
    </div>
  );
};

const Group: React.FC<{ queryRef: PreloadedQuery<foq.paginateGroupQuery> }> = ({
  queryRef,
}) => {
  const hasPinned = useRecoilValue(hasPinnedSlice);

  return (
    <>
      <GroupList queryRef={queryRef} />
      {hasPinned ? (
        <Suspense>
          <DualView queryRef={queryRef} />
        </Suspense>
      ) : (
        <Sample />
      )}
    </>
  );
};

export default Group;
