import React, { useRef, useState } from "react";
import styled from "styled-components";

import {
  Button,
  ClickAwayListener,
  Grow,
  Paper,
  Popper,
  MenuItem,
  MenuList,
} from "@material-ui/core";

const Container = styled.div`
  .menu {
    background-color: ${({ theme }) => theme.menuBackground};
    border: 2px solid ${({ theme }) => theme.menuBorder};
    box-shadow: 0 2px 20px 0 ${({ theme }) => theme.menuShadow};
  }
`;

const Menu = ({ items, onClose, onSelect, ...rest }) => {
  return (
    <Container>
      <ClickAwayListener onClickAway={onClose}>
        <MenuList classes={{ root: "menu" }} {...rest}>
          {items.map((item, i) => (
            <MenuItem key={i} onClick={() => onSelect(item)}>
              {item.name}
            </MenuItem>
          ))}
        </MenuList>
      </ClickAwayListener>
    </Container>
  );
};

export default Menu;
