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
  display: grid;
  grid-template-columns: 264px auto auto;
  padding-top: 5px;
  padding-bottom: 5px;

  > div {
    display: flex;
    align-items: center;
  }

  > div:last-child {
    justify-content: flex-end;
  }

  > div > div {
    display: inline-block;
  }

  ${DropdownHandle.Body} {
    padding-top: 0.5em;
    padding-bottom: 0.5em;
  }
`;

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const totalCount = useRecoilValue(selectors.totalCount);
  const filteredCount = useRecoilValue(selectors.filteredCount);
  const countStr =
    typeof filteredCount === "number"
      ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`
      : (totalCount || 0).toLocaleString();
  return (
    <Wrapper>
      <div>
        <DropdownHandle
          label="Display Options"
          expanded={showSidebar}
          onClick={onShowSidebar && (() => onShowSidebar(!showSidebar))}
          style={{ width: 240 }}
        />
      </div>
      <div>
        <SelectionMenu />
      </div>
      <div>
        <div className="total">
          Viewing <strong>{countStr} samples</strong>
        </div>
      </div>
    </Wrapper>
  );
};

export default ImageContainerHeader;
