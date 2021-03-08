import React from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import DropdownHandle from "./DropdownHandle";
import Tagger from "./Tagger";
import * as selectors from "../recoil/selectors";

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
  overflow-x: hidden;
  margin-left: -1rem;
  margin-right: -1rem;
  margin-bottom: -0.5rem;
  flex-grow: 1;
`;

const CountDiv = styled.div`
  padding-right: 1rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
`;

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const totalCount = useRecoilValue(selectors.totalCount);
  const filteredCount = useRecoilValue(selectors.filteredCount);

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
        label="Fields"
        expanded={showSidebar}
        onClick={onShowSidebar && (() => onShowSidebar(!showSidebar))}
        style={{ width: 240 }}
      />
      <SamplesHeader>
        <Tagger modal={false} />
        {countStr !== null ? (
          <CountDiv>
            <div>
              Viewing <strong>{countStr} samples</strong>
            </div>
          </CountDiv>
        ) : null}
      </SamplesHeader>
    </Wrapper>
  );
};

export default ImageContainerHeader;
