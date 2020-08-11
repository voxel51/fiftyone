import React from "react";
import styled from "styled-components";
import logo from "../logo.png";
import { useRecoilValue } from "recoil";
import * as selectors from "../recoil/selectors";

const HeaderDiv = styled.div`
  background-color: ${(theme) => theme.backgroundDark};
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 10px;
  border-bottom: 2px hsl(210, 5%, 24%) solid;
`;

const LogoDiv = styled.div`
  height: 60px;
`;

const LogoImg = styled.img`
  height: 100%;
  width: auto;
  margin-top: 2px;
  padding: 0.25rem 0.5rem 0.25rem 0;
  border-right-width: 2px;
  border-color: hsl(210, 5%, 24%);
  border-right-style: solid;
`;

const LeftDiv = styled.div`
  display: flex;
`;

const TitleDiv = styled.div`
  padding: 0.25rem 1rem;
`;

const FiftyOneDiv = styled.div`
  color: ${(theme) => theme.font};
  font-weight: bold;
  font-size: 1.5rem;
  line-height: 1.5;
`;

const DatasetDiv = styled.div`
  line-height: 1;
`;

const DatasetNameDiv = styled.div`
  font-weight: bold;
  line-height: 1rem;
`;

const Header = () => {
  const datasetNameValue = useRecoilValue(selectors.datasetName);

  return (
    <HeaderDiv>
      <LeftDiv>
        <LogoDiv>
          <LogoImg src={logo} />
        </LogoDiv>
        <TitleDiv>
          <FiftyOneDiv>FiftyOne</FiftyOneDiv>
          <DatasetDiv>
            {datasetNameValue
              ? datasetNameValue.toUpperCase()
              : "NO DATASET LOADED"}
          </DatasetDiv>
        </TitleDiv>
      </LeftDiv>
    </HeaderDiv>
  );
};

export default Header;
