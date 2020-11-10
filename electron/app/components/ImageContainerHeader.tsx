import React from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import DropdownHandle from "./DropdownHandle";
import SelectionMenu from "./SelectionMenu";
import * as selectors from "../recoil/selectors";

type Props = {
  showSidebar: boolean;
  onShowSidebar: (show: boolean) => void;
};

const Wrapper = styled.div`
  background: ${({ theme }) => theme.background};
  display: flex;
  margin-bottom: 0.5rem;

  ${DropdownHandle.Body} {
    width: 264px;
  }
`;

const SamplesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  flex-grow: 1;
  height: 45px;
  overflow-x: hidden;
  margin-left: 1rem;
  margin-right: -1rem;
  padding: 0.5rem 0;
`;

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const totalCount = useRecoilValue(selectors.totalCount);
  const filteredCount = useRecoilValue(selectors.filteredCount);
  const countStr =
    typeof filteredCount === "number" && filteredCount !== totalCount
      ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`
      : (totalCount || 0).toLocaleString();
  return (
    <Wrapper>
      <DropdownHandle
        label="Display Options"
        expanded={showSidebar}
        onClick={onShowSidebar && (() => onShowSidebar(!showSidebar))}
        style={{ width: 240 }}
      />
      <SamplesHeader>
        <SelectionMenu />
        <div className="total" style={{ paddingRight: "1rem" }}>
          Viewing <strong>{countStr} samples</strong>
        </div>
      </SamplesHeader>
    </Wrapper>
  );
};

export default ImageContainerHeader;
