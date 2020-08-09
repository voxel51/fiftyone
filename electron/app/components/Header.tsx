import React from "react";
import styled from "styled-components";
import logo from "../logo.png";

const HeaderDiv = styled.div`
  background-color: ${(theme) => theme.backgroundDark};
  display: flex;
  justify-content: space-between;
  width: 100%;
`;

const LogoDiv = styled.div`
  height: 3rem;
  margin: 1rem 0;
`;

const LogoImg = styled.img`
  height: 100%;
  width: auto;
  padding: 0 1rem;
  border-right-width: 2px;
  border-right-color: ${(theme) => theme.backgroundDarkBorder};
  border-right-style: solid;
`;

const Header = () => {
  return (
    <HeaderDiv>
      <LogoDiv>
        <LogoImg src={logo} />
      </LogoDiv>
    </HeaderDiv>
  );
};

export default Header;
