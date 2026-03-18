import { ErrorBoundary } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isDirect3dSamplePath } from "@fiftyone/utilities";
import React, { Suspense, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import Group from "./Group";
import { Sample2D } from "./Sample2D";
import { Sample3d } from "./Sample3d";

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
`;

export const ModalSample = React.memo(() => {
  const isGroup = useRecoilValue(fos.isGroup);
  const is3DMediaType = useRecoilValue(fos.is3DDataset);
  const sample = useRecoilValue(fos.modalSample);
  const modalMediaField = useRecoilValue(fos.selectedMediaField(true));
  const isDirect3dSampleUnknownMediaType = useMemo(() => {
    const mediaPath = Array.isArray(sample.urls)
      ? sample.urls.find((url) => url.field === modalMediaField)?.url ??
        sample.urls[0]?.url
      : sample.urls[modalMediaField];

    return (
      isDirect3dSamplePath(mediaPath) ||
      isDirect3dSamplePath(sample.sample.filepath)
    );
  }, [sample, modalMediaField]);

  const setIsTooltipLocked = useSetRecoilState(fos.isTooltipLocked);
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);

  useEffect(() => {
    // reset tooltip state when modal is closed
    setIsTooltipLocked(false);

    return () => {
      setTooltipDetail(null);
    };
  }, []);

  return (
    <ContentColumn data-cy="sample-canvas">
      <ErrorBoundary onReset={() => {}}>
        <Suspense>
          {isGroup ? (
            <Group />
          ) : is3DMediaType || isDirect3dSampleUnknownMediaType ? (
            <Sample3d />
          ) : (
            <Sample2D />
          )}
        </Suspense>
      </ErrorBoundary>
    </ContentColumn>
  );
});
