import React from "react";
import styled from "styled-components";

import DropdownHandle from "./DropdownHandle";
import SelectionMenu from "./SelectionMenu";

type Props = {
  datasetName: string;
  total: number;
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

const ImageContainerHeader = ({
  datasetName,
  total = 0,
  showSidebar,
  onShowSidebar,
}: Props) => {
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
          Viewing <strong>{total.toLocaleString()} samples</strong>
        </div>
      </div>
    </Wrapper>
  );
};

export default ImageContainerHeader;
