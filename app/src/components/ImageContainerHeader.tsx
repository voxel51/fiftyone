import React from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import DropdownHandle from "./DropdownHandle";
import Actions from "./Actions";
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
        label="Filters"
        expanded={showSidebar}
        onClick={onShowSidebar && (() => onShowSidebar(!showSidebar))}
        style={{ width: 256, padding: "0.25rem 0.5rem" }}
      />
      <SamplesHeader>
        <Actions modal={false} />
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
