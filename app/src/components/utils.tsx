import React from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { KeyboardArrowUp, KeyboardArrowDown } from "@material-ui/icons";

import { useTheme } from "../utils/hooks";

export const Box = styled.div`
  padding: 1em;
  box-sizing: border-box;
  border: 2px solid ${({ theme }) => theme.border};
  background-color: ${({ theme }) => theme.background};
`;

export const VerticalSpacer = styled.div`
  height: ${({ height }) =>
    typeof height == "number" ? height + "px" : height};
  background-color: ${({ opaque, theme }) =>
    opaque ? theme.background : undefined};
`;

export const Button = styled.button`
  display: flex;
  align-items: center;
  background-color: ${({ theme }) => theme.button};
  color: ${({ theme }) => theme.font};
  border: 1px solid ${({ theme }) => theme.buttonBorder};
  border-radius: 1px;
  margin: 0 3px;
  padding: 3px 10px;
  font-weight: bold;
  cursor: pointer;

  svg.MuiSvgIcon-root {
    font-size: 1.25em;
    margin-left: -3px;
    margin-right: 3px;
  }
`;

export const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.overlay};
`;

export const ModalFooter = styled.div`
  border-top: 2px solid ${({ theme }) => theme.border};
  padding: 1em;
  background-color: ${({ theme }) => theme.backgroundLight};
`;

export const scrollbarStyles = ({ theme }) => `
::-webkit-scrollbar {
  width: 16px;
}
scrollbar-width: none;
@-moz-document url-prefix() {
  padding-right: 16px;
}

::-webkit-scrollbar-track {
  border: solid 4px transparent ${theme.fontDarkest};
}

::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px transparent;
  border: solid 4px transparent;
  border-radius: 16px;
  transition: box-shadow linear 0.5s;
}
&:hover::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px ${theme.fontDarkest};
}
`;

export const ContentDiv = styled.div`
  box-sizing: border-box;
  border-radius: 3px;
  background-color: ${({ theme }) => theme.backgroundDarker};
  color: ${({ theme }) => theme.fontDark};
  border: 1px solid #191c1f;
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border-radius: 2px;
  padding: 0.5rem;
  line-height: 1rem;
  margin-top: 2.5rem;
  font-weight: bold;
  width: auto;
  z-index: 802;
`;

export const ContentHeader = styled.div`
  color: ${({ theme }) => theme.font};
  display: flex;
  padding-bottom: 0.5rem;
`;

const PillButtonDiv = animated(styled.div`
  line-height: 1.5rem;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  background-color: ${({ theme }) => theme.button};
  height: 2rem;
  border-radius: 1rem;
  border: none;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  box-shadow: 0 2px 10px ${({ theme }) => theme.backgroundDarker};

  &.hidden {
    background-color: ${({ theme }) => theme.brand};
  }
  & > span {
    margin: 0 0.25rem;
  }
  & > svg {
    display: inline-block;
    height: 1.5rem;
    width: 1.5rem;
  }
`);

type PillButton = {
  onClick: () => void;
  open: boolean;
  highlight: boolean;
  text?: string;
  icon: any;
  arrow?: boolean;
};

export const PillButton = React.memo(
  ({ onClick, open, text, icon, highlight, arrow = false }: PillButton) => {
    const theme = useTheme();
    const props = useSpring({
      opacity: 1,
      backgroundColor: !highlight ? theme.button : theme.brand,
      from: {
        opacity: 0,
      },
    });
    return (
      <PillButtonDiv onClick={onClick} style={props}>
        {icon}
        {text && <span>{text}</span>}
        {arrow && (open ? <KeyboardArrowUp /> : <KeyboardArrowDown />)}
      </PillButtonDiv>
    );
  }
);

export const PopoutDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 0.6rem;
  position: fixed;
  width: auto;
  z-index: 801;
  max-height: 328px;
  width: 18rem;
  font-size: 14px;
  padding: 0 0.5rem 0 0.5rem;
`);
