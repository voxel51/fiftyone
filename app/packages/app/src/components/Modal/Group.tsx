import {
  group,
  groupContainer,
  groupSample,
  groupSampleActive,
  mainGroup,
} from "./Group.module.css";

import { PluginComponentType, usePlugin } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import {
  groupField,
  groupId,
  hasPinnedSlice,
  modal,
  pinnedSlice,
  pinnedSliceSampleFragment,
  sidebarOverride,
  useClearModal,
  useOnSelectLabel,
} from "@fiftyone/state";
import React, {
  MouseEventHandler,
  MutableRefObject,
  Suspense,
  useCallback,
  useRef,
  useState,
} from "react";
import { useFragment } from "react-relay";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import GroupList from "../Group";
import Sample from "./Sample";
import classNames from "classnames";
import { GroupBar, GroupSampleBar } from "./Bars";
import { VideoLooker } from "@fiftyone/looker";
import Looker from "./Looker";
import {
  paginateGroupPinnedSampleFragment,
  paginateGroupPinnedSample_query$key,
} from "@fiftyone/relay";
import { Resizable } from "re-resizable";
import { Loading, useTheme } from "@fiftyone/components";

const GroupSample: React.FC<
  React.PropsWithChildren<{
    sampleId: string;
    slice: string;
    pinned: boolean;
    onClick: MouseEventHandler;
    onMouseEnter: MouseEventHandler;
    onMouseLeave: MouseEventHandler;
  }>
> = ({
  children,
  onClick,
  pinned,
  sampleId,
  slice,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [hovering, setHovering] = useState(false);

  const timeout: MutableRefObject<number | null> = useRef<number>(null);
  const clear = useCallback(() => {
    if (hoveringRef.current) return;
    timeout.current && clearTimeout(timeout.current);
    setHovering(false);
  }, []);
  const update = useCallback(() => {
    !hovering && setHovering(true);
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(clear, 3000);

    return () => {
      timeout.current && clearTimeout(timeout.current);
    };
  }, [clear, hovering]);
  const hoveringRef = useRef(false);
  return (
    <div
      className={
        pinned ? classNames(groupSample, groupSampleActive) : groupSample
      }
      onMouseEnter={(e) => {
        update();
        onMouseEnter(e);
      }}
      onMouseMove={update}
      onMouseLeave={(e) => {
        clear();
        onMouseLeave(e);
      }}
      onClickCapture={onClick}
    >
      {children}
      {hovering && (
        <GroupSampleBar
          hoveringRef={hoveringRef}
          sampleId={sampleId}
          pinned={pinned}
          slice={slice}
        />
      )}
    </div>
  );
};

const useSlice = (sample: any): string => {
  const field = useRecoilValue(groupField);
  return sample[field].name;
};

const MainSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | undefined>;
}> = ({ lookerRef }) => {
  const data = useRecoilValue(modal);

  if (!data) {
    throw new Error("no data");
  }

  const { sample, navigation } = data;
  const clearModal = useClearModal();
  const pinned = !useRecoilValue(sidebarOverride);
  const reset = useResetRecoilState(sidebarOverride);
  const slice = useSlice(sample);
  const hover = fos.useHoveredSample(sample);

  return (
    <GroupSample
      sampleId={sample._id}
      slice={slice}
      pinned={pinned}
      onClick={reset}
      {...hover.handlers}
    >
      <Looker
        key={sample._id}
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

const withVisualizerPlugin = <
  T extends { fragmentRef: paginateGroupPinnedSample_query$key }
>(
  Component: React.FC<T>
) => {
  return (props: T) => {
    const { sample } = useFragment(
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
      <PluginComponent
        key={sample.sample._id}
        api={pluginAPI}
        sampleOverride={sample.sample}
      />
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

const PinnedSample: React.FC = () => {
  const fragmentRef = useRecoilValue(pinnedSliceSampleFragment);
  const { sample } = useFragment(
    paginateGroupPinnedSampleFragment,
    fragmentRef
  );

  const [pinned, setPinned] = useRecoilState(sidebarOverride);
  const slice = useRecoilValue(pinnedSlice) as string;
  const hover = fos.useHoveredSample(sample.sample);

  if (sample.__typename === "%other") {
    throw new Error("bad sample");
  }

  return (
    <GroupSample
      sampleId={sample.sample._id}
      pinned={Boolean(pinned)}
      onClick={() => setPinned(sample.sample._id)}
      slice={slice}
      {...hover.handlers}
    >
      <PluggableSample fragmentRef={fragmentRef} />
    </GroupSample>
  );
};

const DualView: React.FC = () => {
  const lookerRef = useRef<VideoLooker>();
  const theme = useTheme();

  const [width, setWidth] = React.useState(1000);
  const key = useRecoilValue(groupId);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  return (
    <div className={groupContainer}>
      <GroupBar lookerRef={lookerRef} />
      <div className={mainGroup}>
        <Resizable
          size={{ height: "100% !important", width }}
          minWidth={"30%"}
          maxWidth={"70%"}
          enable={{
            top: false,
            right: true,
            bottom: false,
            left: false,
            topRight: false,
            bottomRight: false,
            bottomLeft: false,
            topLeft: false,
          }}
          onResizeStop={(e, direction, ref, { width: delta }) => {
            setWidth(width + delta);
          }}
          style={{
            position: "relative",
            borderRight: `1px solid ${theme.backgroundDarkBorder}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <GroupList key={`${key}-${mediaField}`} />

          <MainSample lookerRef={lookerRef} />
        </Resizable>

        <Suspense fallback={<Loading>Pixelating...</Loading>}>
          <PinnedSample />
        </Suspense>
      </div>
    </div>
  );
};

const Group: React.FC = () => {
  const hasPinned = useRecoilValue(hasPinnedSlice);
  const key = useRecoilValue(groupId);

  return (
    <>
      {hasPinned ? (
        <Suspense>
          <DualView />
        </Suspense>
      ) : (
        <>
          <GroupList key={key} /> <Sample />
        </>
      )}
    </>
  );
};

export default Group;
