import { useTheme } from "@fiftyone/components";
import type { ImageLooker } from "@fiftyone/looker";
import { isNativeMediaType } from "@fiftyone/looker/src/util";
import * as fos from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { ImaVidLookerReact } from "./ImaVidLooker";
import { LighterSampleRenderer } from "./Lighter/LighterSampleRenderer";
import { MetadataLooker } from "./MetadataLooker";
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
    []
  );
};

interface LookerProps {
  sample: fos.ModalSample;

  // note: this is a hack we're using while migrating to lighter
  // a lot of components depend on lighterRef being defined (see `useVisibleSampleLabels` for example)
  // we'll remove this once we've migrated to lighter
  // `ghost` means looker will render but with width and height set to 0
  ghost?: boolean;
}

const ModalLookerNoTimeline = React.memo((props: LookerProps) => {
  const { id, ref, looker } = useLooker<ImageLooker>(props);
  const theme = useTheme();

  useImageModalSelectiveRendering(id, looker);

  return (
    <div
      ref={ref}
      id={id}
      data-cy="modal-looker-container"
      style={{
        width: props.ghost ? 0 : "100%",
        height: props.ghost ? 0 : "100%",
        background: theme.background.level2,
        position: "relative",
      }}
    />
  );
});

export const ModalLooker = React.memo(
  ({ sample: propsSampleData }: LookerProps) => {
    const modalSampleData = useRecoilValue(fos.modalSample);
    const mode = useAtomValue(fos.modalMode);
    const sample = useMemo(() => {
      if (propsSampleData) {
        return {
          ...modalSampleData,
          ...propsSampleData,
        };
      }

      return modalSampleData;
    }, [propsSampleData, modalSampleData]);

    const shouldRenderImavid = useRecoilValue(
      fos.shouldRenderImaVidLooker(true)
    );
    const video = useRecoilValue(fos.isVideoDataset);

    const modalMediaField = useRecoilValue(fos.selectedMediaField(true));

    if (shouldRenderImavid) {
      return <ImaVidLookerReact sample={sample} key={modalMediaField} />;
    }

    if (video) {
      return <VideoLookerReact sample={sample} />;
    }

    if (
      isNativeMediaType(sample.sample.media_type ?? sample.sample._media_type)
    ) {
      return (
        <>
          {mode === "annotate" && <LighterSampleRenderer sample={sample} />}
          <ModalLookerNoTimeline sample={sample} ghost={mode === "annotate"} />
        </>
      );
    }

    return <MetadataLooker sample={sample} />;
  }
);
