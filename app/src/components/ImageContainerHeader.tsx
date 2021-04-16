import React from "react";
import styled from "styled-components";
import { constSelector, useRecoilValue } from "recoil";

import DropdownHandle from "./DropdownHandle";
import Actions from "./Actions";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
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
  padding-right: 1rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
`;

const RightContainer = styled.div`
  display: flex;
`;

const SliderContainer = styled.div`
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
  border-right-style: solid;
  border-right-width: 1px;
  margin: 0.25rem 0.5rem;
  width: 6rem;
`;

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const totalCount = useRecoilValue(selectors.totalCount);
  const filteredCount = useRecoilValue(selectors.filteredCount);
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
          <SliderContainer>
            <Slider
              valueAtom={atoms.gridZoom}
              boundsAtom={constSelector([0, 10])}
              color={theme.brand}
              showNumbers={false}
              int={true}
            />
          </SliderContainer>
          {countStr !== null ? (
            <CountDiv>
              <div>
                Viewing <strong>{countStr} samples</strong>
              </div>
            </CountDiv>
          ) : null}
        </RightContainer>
      </SamplesHeader>
    </Wrapper>
  );
};

export default ImageContainerHeader;
