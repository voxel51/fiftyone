import {
  groupContainer,
  groupSample,
  groupSampleActive,
  mainGroup,
} from "./Group.module.css";

import * as fos from "@fiftyone/state";
import {
  currentSlice,
  defaultGroupSlice,
  defaultPcdSlice,
  groupField,
  groupId,
  groupSample as groupSampleSelectorFamily,
  pcdSampleQueryFamily,
  pinned3DSample,
  useBrowserStorage,
  useClearModal,
} from "@fiftyone/state";
import React, {
  MouseEventHandler,
  MutableRefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Loading, useTheme } from "@fiftyone/components";
import { VideoLooker } from "@fiftyone/looker";
import classNames from "classnames";
import { Resizable } from "re-resizable";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import GroupList from "../Group";
import { GroupBar, GroupSampleBar } from "./Bars";
import Looker from "./Looker";
import { Sample3d } from "./Sample3d";

const DEFAULT_SPLIT_VIEW_LEFT_WIDTH = "800";

const PixelatingSuspense = ({ children }: { children: React.ReactNode }) => {
  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>{children}</Suspense>
  );
};

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
        />
      )}
    </div>
  );
};

const useSlice = (sample: any): string => {
  const field = useRecoilValue(groupField);
  return sample[field].name;
};

const AltGroupSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | undefined>;
  lookerRefCallback?: (looker) => void;
  altSlice: string;
}> = ({ lookerRef, lookerRefCallback, altSlice }) => {
  const { sample, urls } = useRecoilValue(groupSampleSelectorFamily(altSlice));
  const clearModal = useClearModal();
  const reset = useResetRecoilState(pinned3DSample);

  const hover = fos.useHoveredSample(sample);

  return (
    <GroupSample
      sampleId={sample._id}
      slice={altSlice}
      pinned={false}
      onClick={reset}
      {...hover.handlers}
    >
      <Looker
        key={sample._id}
        sample={sample}
        urls={urls}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </GroupSample>
  );
};

const MainSample: React.FC<{
  lookerRef: MutableRefObject<VideoLooker | undefined>;
  lookerRefCallback?: (looker) => void;
}> = ({ lookerRef, lookerRefCallback }) => {
  const { sample, urls } = useRecoilValue(groupSampleSelectorFamily(null));
  const clearModal = useClearModal();
  const pinned = !useRecoilValue(pinned3DSample);
  const reset = useResetRecoilState(pinned3DSample);
  const hover = fos.useHoveredSample(sample);

  const thisSampleSlice = useSlice(sample);
  const currentModalSlice = useRecoilValue(currentSlice(true));
  const defaultSlice = useRecoilValue(defaultGroupSlice);
  const allSlices = useRecoilValue(fos.groupSlices);
  const altSlice = useMemo(() => {
    if (
      sample._media_type !== "point-cloud" ||
      currentModalSlice !== sample.group.name
    )
      return undefined;

    if (currentModalSlice === defaultSlice) {
      return allSlices.find((s) => s !== defaultSlice);
    }

    return defaultSlice;
  }, [currentModalSlice, defaultSlice, sample, allSlices]);

  if (altSlice) {
    return (
      <AltGroupSample
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        altSlice={altSlice}
      />
    );
  }

  return (
    <GroupSample
      sampleId={sample._id}
      slice={thisSampleSlice}
      pinned={pinned}
      onClick={reset}
      {...hover.handlers}
    >
      <Looker
        sample={sample}
        urls={urls}
        key={sample._id}
        lookerRef={lookerRef}
        lookerRefCallback={lookerRefCallback}
        onClose={clearModal}
      />
    </GroupSample>
  );
};

const Sample3dWrapper: React.FC = () => {
  const [pinned, setPinned] = useRecoilState(pinned3DSample);
  const slice = useRecoilValue(defaultPcdSlice) as string;
  const { sample } = useRecoilValue(pcdSampleQueryFamily(slice));
  const hover = fos.useHoveredSample(sample.sample);

  useEffect(() => () => setPinned(null), []);

  return (
    <GroupSample
      sampleId={sample._id}
      pinned={Boolean(pinned)}
      onClick={() => setPinned(sample._id)}
      slice={slice}
      {...hover.handlers}
    >
      <Sample3d />
    </GroupSample>
  );
};

const DualView: React.FC<{ lookerRefCallback?: (looker) => void }> = ({
  lookerRefCallback,
}) => {
  const lookerRef = useRef<VideoLooker>();
  const theme = useTheme();
  const key = useRecoilValue(groupId);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const isCarouselVisible = useRecoilValue(fos.groupMediaIsCarouselVisible);

  const pointCloudSliceExists = useRecoilValue(fos.pointCloudSliceExists);
  const is3DVisible =
    useRecoilValue(fos.groupMediaIs3DVisible) && pointCloudSliceExists;
  const isImageVisible = useRecoilValue(fos.groupMediaIsImageVisible);

  const shouldSplitVertically = useMemo(
    () => is3DVisible && isImageVisible,
    [is3DVisible, isImageVisible]
  );

  const [width, setWidth] = useBrowserStorage(
    "group-modal-split-view-width",
    shouldSplitVertically ? DEFAULT_SPLIT_VIEW_LEFT_WIDTH : "100%"
  );

  useEffect(() => {
    if (!shouldSplitVertically) {
      setWidth("100%");
    }
  }, [shouldSplitVertically, setWidth]);

  return (
    <div className={groupContainer} data-cy="group-container">
      <GroupBar lookerRef={lookerRef} />
      <div className={mainGroup}>
        {(isCarouselVisible || isImageVisible) && (
          <Resizable
            size={{ height: "100% !important", width }}
            minWidth={300}
            maxWidth={shouldSplitVertically ? "90%" : "100%"}
            enable={{
              top: false,
              right: shouldSplitVertically ? true : false,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            onResizeStop={(e, direction, ref, { width: delta }) => {
              if (width === "100%") {
                setWidth(DEFAULT_SPLIT_VIEW_LEFT_WIDTH);
              } else {
                setWidth(String(Number(width) + delta));
              }
            }}
            style={{
              position: "relative",
              borderRight: `1px solid ${theme.primary.plainBorder}`,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            {isCarouselVisible && (
              <GroupList
                key={`${key}-${mediaField}`}
                fullHeight={!is3DVisible && !isImageVisible}
              />
            )}

            {isImageVisible ? (
              <PixelatingSuspense>
                <MainSample
                  lookerRef={lookerRef}
                  lookerRefCallback={lookerRefCallback}
                />
              </PixelatingSuspense>
            ) : is3DVisible ? (
              <Sample3dWrapper />
            ) : null}
          </Resizable>
        )}

        {shouldSplitVertically && <Sample3dWrapper />}

        {!shouldSplitVertically && is3DVisible && <Sample3dWrapper />}
      </div>
    </div>
  );
};

const Group: React.FC<{ lookerRefCallback: (looker) => void }> = ({
  lookerRefCallback,
}) => {
  return (
    <Suspense>
      <DualView lookerRefCallback={lookerRefCallback} />
    </Suspense>
  );
};

export default Group;
