import React from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";

import ExternalLink from "./ExternalLink";
import * as selectors from "../recoil/selectors";
import logo from "../logo.png";
import { GitHub, MenuBook } from "@material-ui/icons";
import { Slack } from "../icons";

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

const RightDiv = styled.div`
  margin-left: auto;
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

const IconWrapper = styled.div`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;

  a {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  svg {
    margin-right: 0.5em;
  }
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
      <RightDiv>
        <IconWrapper>
          <ExternalLink
            title="Slack"
            href="https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg"
          >
            <Slack />
          </ExternalLink>
          <ExternalLink
            title="GitHub"
            href="https://github.com/voxel51/fiftyone"
          >
            <GitHub />
          </ExternalLink>
          <ExternalLink
            title="Documentation"
            href="https://voxel51.com/docs/fiftyone/user_guide/app.html"
          >
            <MenuBook />
          </ExternalLink>
        </IconWrapper>
      </RightDiv>
    </HeaderDiv>
  );
};

export default Header;
