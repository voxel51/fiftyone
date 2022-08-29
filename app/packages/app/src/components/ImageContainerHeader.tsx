import React, { Suspense } from "react";
import { Apps } from "@material-ui/icons";
import styled from "styled-components";
import { useRecoilValue, useSetRecoilState } from "recoil";

import { GridActionsRow } from "./Actions";
import { Slider } from "./Common/RangeSlider";
import { PathEntryCounts } from "./Sidebar/Entries/EntryCounts";
import { useTheme } from "@fiftyone/components";
import { gridZoom, gridZoomRange } from "./Grid";
import GroupSliceSelector from "./GroupSliceSelector";

import * as fos from "@fiftyone/state";
import { dataset, isGroup } from "@fiftyone/state";

import { Image, OndemandVideo, PhotoLibrary } from "@material-ui/icons";
import Group from "@material-ui/icons";
import { PillButton } from "./utils";
import _ from "lodash";

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

const RightDiv = styled.div`
  cursor: default;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
  border-right-style: solid;
  border-right-width: 0px;
  margin: 0 0.25rem;
  padding-right: 0;
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

const ImageContainerHeader = () => {
  const type = useRecoilValue(fos.dataset).mediaType;
  const setGridZoom = useSetRecoilState(gridZoom);
  const gridZoomRangeValue = useRecoilValue(gridZoomRange);
  const theme = useTheme();
  const group = useRecoilValue(isGroup);
  const element = useRecoilValue(fos.elementNames);
  const total = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );

  return (
    <SamplesHeader>
      <GridActionsRow />
      <RightContainer>
        <Suspense fallback={<RightDiv>{"Loading..."}</RightDiv>}>
          <PillButton
            icon={<MediaTypeIcon type={type} />}
            text={<PathEntryCounts modal={false} path={""} />}
            title={`${total.toLocaleString()} ${_.capitalize(type)} ${
              total === 1 ? element.singular : element.plural
            }`}
            highlight={true}
            flipped={true}
            style={{ height: "2rem", marginTop: "3px", cursor: "default" }}
          />
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

function MediaTypeIcon({ type }) {
  const style = {
    position: "relative",
    top: "0.5rem",
  };

  switch (type) {
    case "video":
      return <OndemandVideo />;
    case "group":
      return <PhotoLibrary />;
    default:
      return <Image />;
  }
}

export default ImageContainerHeader;
