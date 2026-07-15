import { useTheme } from "@fiftyone/components";
import type { ImageLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { isNativeMediaType } from "@fiftyone/utilities";
import { VideoAnnotationSurface } from "@fiftyone/video-annotation";
import { useAtomValue } from "jotai";
import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { ImaVidLookerReact } from "./ImaVidLooker";
import { LighterSampleRenderer } from "./Lighter/LighterSampleRenderer";
import { ModalSampleRenderer } from "./ModalSampleRenderer";
import { VideoLookerReact } from "./VideoLooker";
import useLooker from "./use-looker";
import { useImageModalSelectiveRendering } from "./use-modal-selective-rendering";

export const useShowOverlays = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(fos.showOverlays, event.detail);
  });
};

export const useClearSelectedLabels = () => {
  return useRecoilCallback(
    ({ set }) =>
      async () =>
        set(fos.selectedLabels, []),
    [],
  );
};

interface LookerProps {
  sample?: fos.ModalSample;
  sampleTransitioning?: boolean;
  showControls?: boolean;
}

type NativeLookerProps = LookerProps & { sample: fos.ModalSample };

const ModalLookerNoTimeline = React.memo((props: NativeLookerProps) => {
  const { id, ref, looker } = useLooker<ImageLooker>(props);
  const theme = useTheme();

  useImageModalSelectiveRendering(id, looker);

  return (
    <div
      ref={ref}
      id={id}
      data-cy="modal-looker-container"
      style={{
        width: "100%",
        height: "100%",
        background: theme.background.level2,
        position: "relative",
      }}
    />
  );
});

export const ModalLooker = React.memo(
  ({ sample: propsSampleData, sampleTransitioning }: LookerProps) => {
    return propsSampleData ? (
      <ModalLookerContent
        sample={propsSampleData}
        sampleTransitioning={sampleTransitioning}
      />
    ) : (
      <ModalLookerCurrentSample />
    );
  },
);

const ModalLookerCurrentSample = React.memo(() => {
  const sample = useRecoilValue(fos.modalSample);

  return <ModalLookerContent sample={sample} />;
});

const ModalLookerContent = React.memo(
  ({
    sample,
    sampleTransitioning = false,
  }: {
    sample: fos.ModalSample;
    sampleTransitioning?: boolean;
  }) => {
    const mode = useAtomValue(fos.modalMode);
    const shouldRenderImavid = useRecoilValue(
      fos.shouldRenderImaVidLooker(true),
    );
    const isVideoDataset = useRecoilValue(fos.isVideoDataset);

    const mediaType =
      (sample.sample.media_type as unknown as string) ??
      sample.sample._media_type;

    // the root dataset media type is "group" for grouped datasets, so decide
    // the video surface from the open sample: true for a video dataset or a
    // grouped dataset whose active slice is a video sample
    const video = isVideoDataset || mediaType === "video";

    const isNative = isNativeMediaType(mediaType as string);
    const isAnnotate = mode === fos.ModalMode.ANNOTATE;

    const modalMediaField = useRecoilValue(fos.selectedMediaField(true));

    if (shouldRenderImavid) {
      return (
        <ImaVidLookerReact
          sample={sample}
          key={modalMediaField}
          showControls={mode !== "annotate"}
        />
      );
    }

    if (video) {
      return isAnnotate ? (
        <VideoAnnotationSurface sample={sample} />
      ) : (
        <VideoLookerReact sample={sample} showControls />
      );
    }

    if (isNative) {
      return isAnnotate ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
          }}
        >
          <LighterSampleRenderer sample={sample} />
        </div>
      ) : (
        <ModalLookerNoTimeline sample={sample} showControls />
      );
    }

    return (
      <ModalSampleRenderer
        sample={sample}
        modalMediaField={modalMediaField}
        transitioning={sampleTransitioning}
      />
    );
  },
);
