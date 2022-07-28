import React, { Suspense } from "react";
import { Apps } from "@material-ui/icons";
import styled from "styled-components";
import { useRecoilValue, useSetRecoilState } from "recoil";

import { GridActionsRow } from "./Actions";
import { Slider } from "./Common/RangeSlider";
import { PathEntryCounts } from "./Sidebar/Entries/EntryCounts";
import { useTheme } from "@fiftyone/components";
import { gridZoom, gridZoomRange } from "./Grid";

import * as fos from "@fiftyone/state";

const SamplesHeader = styled.div`
  position: absolute;
  top: 0;
  display: flex;
  padding: 0.5rem;
  justify-content: space-between;
  overflow: visible;
  width: 100%;
  background-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0),
    30%,
    ${({ theme }) => theme.backgroundDark}
  );
  margin-left: -1rem;
`;

const CountDiv = styled.div`
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
  border-right-style: solid;
  border-right-width: 1px;
  margin: 0 0.25rem;
  padding-right: 1rem;
  font-weight: bold;
`;

const RightContainer = styled.div`
  display: flex;
`;

const SliderContainer = styled.div`
  display: flex;
  align-items: center;
  width: 8rem;
  padding-right: 1rem;
`;

const Count = () => {
  const element = useRecoilValue(fos.elementNames);
  const total = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );

  return (
    <CountDiv>
      <div>
        <PathEntryCounts modal={false} path={""} />
        &nbsp;
        {total === 1 ? element.singular : element.plural}
      </div>
    </CountDiv>
  );
};

const ImageContainerHeader = () => {
  const setGridZoom = useSetRecoilState(gridZoom);
  const gridZoomRangeValue = useRecoilValue(gridZoomRange);
  const theme = useTheme();

  return (
    <SamplesHeader>
      <GridActionsRow />
      <RightContainer>
        <Suspense fallback={<CountDiv>{"Loading..."}</CountDiv>}>
          <Count />
        </Suspense>
        <SliderContainer>
          <div style={{ flexGrow: 1 }} title={"Zoom"}>
            <Slider
              valueAtom={gridZoom}
              boundsAtom={gridZoomRange}
              color={theme.brand}
              showBounds={false}
              persistValue={false}
              showValue={false}
              onChange={true}
              style={{ padding: 0, margin: 0 }}
            />
          </div>
          <div
            title={"Reset zoom"}
            onClick={() => {
              setGridZoom(Math.max(gridZoomRangeValue[0], 5));
            }}
            style={{ cursor: "pointer", display: "flex" }}
          >
            <Apps />
          </div>
        </SliderContainer>
      </RightContainer>
    </SamplesHeader>
  );
};

export default ImageContainerHeader;
