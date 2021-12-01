import React from "react";
import { CircularProgress } from "@material-ui/core";
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
import { Slider } from "./Filters/RangeSlider";

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
  margin-left: 1rem;
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

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const totalCount = useRecoilValue(
    aggregationAtoms.count({ path: "", extended: false, modal: false })
  );
  const filteredCount = useRecoilValue(
    aggregationAtoms.count({ path: "", modal: false, extended: true })
  );
  const element = useRecoilValue(viewAtoms.elementNames);
  const setGridZoom = useSetRecoilState(selectors.gridZoom);
  const gridZoomRangeValue = useRecoilValue(gridZoomRange);
  const theme = useTheme();
  let countStr = null;

  if (
    typeof filteredCount === "number" &&
    filteredCount !== totalCount &&
    typeof totalCount === "number"
  ) {
    countStr = `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`;
  } else if (typeof totalCount === "number") {
    countStr = totalCount.toLocaleString();
  }
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
        <Actions modal={false} />
        <RightContainer>
          {countStr !== null ? (
            <CountDiv>
              {countStr} {totalCount === 1 ? element.singular : element.plural}
            </CountDiv>
          ) : (
            <CountDiv>
              <CircularProgress
                style={{
                  color: theme.font,
                  height: 16,
                  width: 16,
                  minWidth: 16,
                }}
              />
            </CountDiv>
          )}
          <SliderContainer>
            <div style={{ flexGrow: 1 }} title={"Zoom"}>
              <Slider
                valueAtom={selectors.gridZoom}
                boundsAtom={gridZoomRange}
                color={theme.brand}
                showBounds={false}
                persistValue={false}
                style={{ padding: 0 }}
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
