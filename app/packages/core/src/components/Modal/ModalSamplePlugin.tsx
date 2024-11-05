import { ErrorBoundary } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { Suspense, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import Group from "./Group";
import { Sample2D } from "./Sample2D";
import { Sample3d } from "./Sample3d";

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding-top: 5px;
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: hidden;
`;

export const ModalSample = React.memo(() => {
  const isGroup = useRecoilValue(fos.isGroup);
  const is3D = useRecoilValue(fos.is3DDataset);

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
    <ContentColumn>
      <ErrorBoundary onReset={() => {}}>
        <Suspense>
          {isGroup ? <Group /> : is3D ? <Sample3d /> : <Sample2D />}
        </Suspense>
      </ErrorBoundary>
    </ContentColumn>
  );
});
