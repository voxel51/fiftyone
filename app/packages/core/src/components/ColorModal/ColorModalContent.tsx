import React, { Fragment, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import CloseIcon from "@mui/icons-material/Close";
import * as fos from "@fiftyone/state";

const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: ${({ theme }) => theme.neutral.softBg};
`;

const Container = styled.div`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  position: relative;
  display: flex;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 20px 25px -20px #000;
`;

const DraggableModalTitle = styled.div`
  flex-direction: row;
  display: flex;
  justify-content: space-between;
  width: 100%;
  height: 2.5rem;
  background-color: ${({ theme }) => theme.background.level1};
  padding: 2px;
  cursor: pointer;
  fontstyle: bold;
`;

const ColorModalContent: React.FunctionComponent = () => {
  const activeColorModalField = useRecoilValue(fos.colorModal);

  return <div></div>;
};
export default ColorModalContent;
