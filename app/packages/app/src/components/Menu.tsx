import React, { useRef, useState } from "react";
import styled from "styled-components";

import {
  Button,
  ClickAwayListener,
  Divider,
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
    box-shadow: 0 2px 20px 0 ${({ theme }) => theme.darkerShadow};

    .item {
      color: ${({ theme }) => theme.fontDark};
      font-family: unset;
      font-weight: bold;
      font-size: 14px;
      line-height: 29px;
      padding-top: 0;
      padding-bottom: 0;
    }

    .divider {
      height: 2px;
      background-color: ${({ theme }) => theme.menuBorder};
      margin: 3px 0;
    }
  }
`;

const Menu = ({ items, onClose, onSelect, ...rest }) => {
  return (
    <Container>
      <ClickAwayListener onClickAway={onClose}>
        <MenuList classes={{ root: "menu" }} {...rest}>
          {items.map((item, i) =>
            item === Menu.DIVIDER ? (
              <Divider key={i} classes={{ root: "divider" }} />
            ) : (
              <MenuItem
                key={i}
                disabled={item.disabled}
                onClick={() => onSelect(item)}
                classes={{ root: "item" }}
              >
                {item.name}
              </MenuItem>
            )
          )}
        </MenuList>
      </ClickAwayListener>
    </Container>
  );
};

Menu.DIVIDER = "-";

export default Menu;
