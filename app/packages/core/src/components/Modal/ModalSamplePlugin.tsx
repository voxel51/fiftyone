import { ErrorBoundary } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { Suspense, useEffect } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import Group from "./Group";
import { useModalContext } from "./hooks";
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

  const tooltip = fos.useTooltip();
  const setIsTooltipLocked = useSetRecoilState(fos.isTooltipLocked);
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);

  const tooltipEventHandler = useRecoilCallback(
    ({ snapshot, set }) =>
      (e) => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (e.detail) {
          set(fos.tooltipDetail, e.detail);
          if (!isTooltipLocked && e.detail?.coordinates) {
            tooltip.setCoords(e.detail.coordinates);
          }
        } else if (!isTooltipLocked) {
          set(fos.tooltipDetail, null);
        }
      },
    [tooltip]
  );

  const { activeLookerRef, onLookerSetSubscribers } = useModalContext();

  useEffect(() => {
    onLookerSetSubscribers.current.push((looker) => {
      looker.addEventListener("tooltip", tooltipEventHandler);
    });

    return () => {
      activeLookerRef?.current?.removeEventListener(
        "tooltip",
        tooltipEventHandler
      );
    };
  }, [activeLookerRef, onLookerSetSubscribers, tooltipEventHandler]);

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
