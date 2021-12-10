import React, { Suspense } from "react";
import { Apps } from "@material-ui/icons";
import styled from "styled-components";
import { useRecoilValue, useSetRecoilState } from "recoil";

import * as aggregationAtoms from "../recoil/aggregations";
import * as selectors from "../recoil/selectors";
import * as viewAtoms from "../recoil/view";
import { useTheme } from "./../utils/hooks";

import Actions from "./Actions";
import DropdownHandle from "./DropdownHandle";
import { gridZoomRange } from "./Flashlight";
import { Slider } from "./Common/RangeSlider";
import { PathEntryCounts } from "./Sidebar/Entries/EntryCounts";

type Props = {
  showSidebar: boolean;
  onShowSidebar: (show: boolean) => void;
};

const Wrapper = styled.div`
  background: ${({ theme }) => theme.background};
  display: flex;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
  padding: 0 1rem;
`;

const SamplesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  overflow: visible;
  margin-left: 1.25rem;
  margin-right: -1rem;
  margin-bottom: -0.5rem;
  flex-grow: 1;
  height: 37px;
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
  width: 8rem;
  padding-right: 1rem;
  margin: 0.25rem 0;
`;

const Count = () => {
  const element = useRecoilValue(viewAtoms.elementNames);
  const total = useRecoilValue(
    aggregationAtoms.count({ path: "", extended: false, modal: false })
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

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const setGridZoom = useSetRecoilState(selectors.gridZoom);
  const gridZoomRangeValue = useRecoilValue(gridZoomRange);
  const theme = useTheme();

  return (
    <Wrapper>
      <DropdownHandle
        expanded={showSidebar}
        onClick={onShowSidebar && (() => onShowSidebar(!showSidebar))}
        style={{ width: 248, padding: "0.25rem 0.5rem" }}
      >
        Filters
      </DropdownHandle>
      <SamplesHeader>
        <Actions modal={false} style={{ flexWrap: "nowrap" }} />
        <RightContainer>
          <Suspense fallback={"Loading..."}>
            <Count />
          </Suspense>
          <SliderContainer>
            <div style={{ flexGrow: 1 }} title={"Zoom"}>
              <Slider
                valueAtom={selectors.gridZoom}
                boundsAtom={gridZoomRange}
                color={theme.brand}
                showBounds={false}
                persistValue={false}
                style={{ padding: 0, margin: 0 }}
              />
            </div>
            <div
              title={"Reset zoom"}
              onClick={() => {
                setGridZoom(Math.max(gridZoomRangeValue[0], 5));
              }}
              style={{ cursor: "pointer" }}
            >
              <Apps style={{ marginTop: 2.5 }} />
            </div>
          </SliderContainer>
        </RightContainer>
      </SamplesHeader>
    </Wrapper>
  );
};

export default ImageContainerHeader;
