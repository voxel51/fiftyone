import { AnnotationTopBar } from "@fiftyone/annotation";
import { useTheme } from "@fiftyone/components";
import type { ImageLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { VideoAnnotationSurface } from "@fiftyone/video-annotation";
import { useAtomValue } from "jotai";
import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { ImaVidLookerReact } from "./ImaVidLooker";
import { ImageAnnotationSurface } from "./Lighter/ImageAnnotationSurface";
import surfaceStyles from "./Lighter/ImageAnnotationSurface.module.css";
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
    const isAnnotate = mode === fos.ModalMode.ANNOTATE;

    const modalMediaField = useRecoilValue(fos.selectedMediaField(true));
    const selectedMedia = fos.resolveMediaFieldLooker({
      mediaField: modalMediaField,
      sample: sample.sample,
      urls: fos.getNormalizedUrls(sample.urls),
    });
    const isNative = selectedMedia.nativeLookerType !== null;

    if (shouldRenderImavid) {
      return (
        <ImaVidLookerReact
          sample={sample}
          key={modalMediaField}
          showControls={mode !== "annotate"}
        />
      );
    }

    if (selectedMedia.nativeLookerType === "video") {
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
          <ImageAnnotationSurface sample={sample} />
        </div>
      ) : (
        // The same media-facts bar as Annotate, so the media region keeps
        // identical dimensions across the two modes and the viewport
        // transfer maps 1:1.
        <div className={surfaceStyles.root} data-cy="image-explore-surface">
          <AnnotationTopBar sample={sample} />
          <div className={surfaceStyles.content}>
            <ModalLookerNoTimeline sample={sample} showControls />
          </div>
        </div>
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
