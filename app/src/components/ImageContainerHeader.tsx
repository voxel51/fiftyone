import React from "react";
import { Apps } from "@material-ui/icons";
import styled from "styled-components";
import { constSelector, useRecoilValue, useResetRecoilState } from "recoil";

import DropdownHandle from "./DropdownHandle";
import Actions from "./Actions";
import * as selectors from "../recoil/selectors";
import { gridZoom } from "./Samples.hooks";
import { useTheme } from "./../utils/hooks";
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

  ${DropdownHandle.Body} {
    width: 264px;
  }
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
  const totalCount = useRecoilValue(selectors.totalCount);
  const filteredCount = useRecoilValue(selectors.filteredCount);
  const resetGridZoom = useResetRecoilState(gridZoom);
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
        label="Filters"
        expanded={showSidebar}
        onClick={onShowSidebar && (() => onShowSidebar(!showSidebar))}
        style={{ width: 256, padding: "0.25rem 0.5rem" }}
      />
      <SamplesHeader>
        <Actions modal={false} />
        <RightContainer>
          {countStr !== null ? (
            <CountDiv>
              <div>
                Viewing <strong>{countStr} samples</strong>
              </div>
            </CountDiv>
          ) : null}
          <SliderContainer>
            <div style={{ flexGrow: 1 }} title={"Zoom"}>
              <Slider
                valueAtom={gridZoom}
                boundsAtom={constSelector([0, 10])}
                color={theme.brand}
                showBounds={false}
                persistValue={false}
                int={true}
              />
            </div>
            <div
              title={"Reset zoom"}
              onClick={() => resetGridZoom()}
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
