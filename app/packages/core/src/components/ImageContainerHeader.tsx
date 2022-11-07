import React, { Suspense } from "react";
import { Apps } from "@mui/icons-material";
import styled from "styled-components";
import { useRecoilValue, useSetRecoilState } from "recoil";

import { GridActionsRow } from "./Actions";
import { Slider } from "./Common/RangeSlider";
import { PathEntryCounts } from "./Sidebar/Entries/EntryCounts";
import { useTheme } from "@fiftyone/components";
import { gridZoom, gridZoomRange } from "./Grid";
import GroupSliceSelector from "./GroupSliceSelector";

import * as fos from "@fiftyone/state";
import { groupStatistics, isGroup } from "@fiftyone/state";

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
    ${({ theme }) => theme.background.mediaSpace}
  );
  margin-left: -1rem;
`;

const RightDiv = styled.div`
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  border-color: ${({ theme }) => theme.primary.plainBorder};
  border-right-style: solid;
  border-right-width: 1px;
  margin: 0 0.25rem;
  padding-right: 1rem;
  font-weight: bold;
`;

const RightContainer = styled.div`
  display: flex;
  color: ${({ theme }) => theme.text.secondary};
`;

const SliderContainer = styled.div`
  display: flex;
  align-items: center;
  width: 8rem;
  padding-right: 1rem;
`;

const Count = () => {
  let element = useRecoilValue(fos.elementNames);
  const total = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );
  const group = useRecoilValue(isGroup);
  if (group) {
    element = {
      plural: "groups",
      singular: "group",
    };
  }

  return (
    <RightDiv>
      <div>
        <PathEntryCounts modal={false} path={""} />
        &nbsp;
        {total === 1 ? element.singular : element.plural}
      </div>
    </RightDiv>
  );
};

const GroupsCount = () => {
  let element = useRecoilValue(fos.elementNames);
  const total = useRecoilValue(
    fos.count({ path: "_", extended: false, modal: false })
  );
  const elementTotal = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );

  return (
    <RightDiv>
      <div>
        <PathEntryCounts modal={false} path={"_"} />
        &nbsp;
        {total === 1 ? "group" : "groups"}
        &nbsp; (<PathEntryCounts modal={false} path={""} />
        &nbsp;
        {elementTotal === 1 ? element.singular : element.plural})
      </div>
    </RightDiv>
  );
};

const ImageContainerHeader = () => {
  const setGridZoom = useSetRecoilState(gridZoom);
  const gridZoomRangeValue = useRecoilValue(gridZoomRange);
  const theme = useTheme();
  const group = useRecoilValue(isGroup);
  const groupStats = useRecoilValue(groupStatistics(false));

  return (
    <SamplesHeader>
      <GridActionsRow />
      <RightContainer>
        <Suspense fallback={<RightDiv>{"Loading..."}</RightDiv>}>
          {groupStats === "group" ? <GroupsCount /> : <Count />}
        </Suspense>
        {group && (
          <RightDiv>
            <GroupSliceSelector />
          </RightDiv>
        )}
        <SliderContainer>
          <div style={{ flexGrow: 1 }} title={"Zoom"}>
            <Slider
              valueAtom={gridZoom}
              boundsAtom={gridZoomRange}
              color={theme.primary.plainColor}
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
