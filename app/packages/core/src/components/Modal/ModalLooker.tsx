import { useTheme } from "@fiftyone/components";
import type { ImageLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React, { useEffect, useMemo } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import { ImaVidLookerReact } from "./ImaVidLooker";
import { VideoLookerReact } from "./VideoLooker";
import { useModalContext } from "./hooks";
import useLooker from "./use-looker";

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
}

const ModalLookerNoTimeline = React.memo((props: LookerProps) => {
  const { id, looker, ref } = useLooker<ImageLooker>(props);
  const theme = useTheme();
  const setModalLooker = useSetRecoilState(fos.modalLooker);

  const { setActiveLookerRef } = useModalContext();

  useEffect(() => {
    setModalLooker(looker);
  }, [looker, setModalLooker]);

  useEffect(() => {
    if (looker) {
      setActiveLookerRef(looker as fos.Lookers);
    }
  }, [looker, setActiveLookerRef]);

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
  ({ sample: propsSampleData }: LookerProps) => {
    const modalSampleData = useRecoilValue(fos.modalSample);

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

    if (shouldRenderImavid) {
      return <ImaVidLookerReact sample={sample} />;
    }

    if (video) {
      return <VideoLookerReact sample={sample} />;
    }

    return <ModalLookerNoTimeline sample={sample} />;
  }
);
