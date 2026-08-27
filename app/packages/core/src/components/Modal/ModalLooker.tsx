import { useTheme } from "@fiftyone/components";
import type { ImageLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { VideoAnnotationSurface } from "@fiftyone/video-annotation";
import { useAtomValue } from "jotai";
import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { ImaVidLookerReact } from "./ImaVidLooker";
import { LighterSampleRenderer } from "./Lighter/LighterSampleRenderer";
import { ModalSampleRenderer } from "./ModalSampleRenderer";
import { VideoLookerReact } from "./VideoLooker";
import {
  useIsVideoTimelinePoc,
  VideoTimelineSurface,
} from "./VideoTimelineSurface";
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
        minHeight: 0,
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
    const isVideoTimelinePoc = useIsVideoTimelinePoc();
    const isAnnotate = mode === fos.ModalMode.ANNOTATE;

    const modalMediaField = useRecoilValue(fos.selectedMediaField(true));
    const selectedMedia = fos.resolveMediaFieldLooker({
      mediaField: modalMediaField,
      sample: sample.sample,
      urls: fos.getNormalizedUrls(sample.urls),
    });
    const isNative = selectedMedia.nativeLookerType !== null;
    const isVideo = selectedMedia.nativeLookerType === "video";

    if (shouldRenderImavid) {
      return (
        <ImaVidLookerReact
          sample={sample}
          key={modalMediaField}
          showControls={mode !== "annotate"}
        />
      );
    }

    if (isVideo) {
      if (isAnnotate) {
        return <VideoAnnotationSurface sample={sample} />;
      }
      return isVideoTimelinePoc ? (
        <VideoTimelineSurface sample={sample} />
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
