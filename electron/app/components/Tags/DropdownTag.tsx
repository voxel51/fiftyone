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
import { ArrowDropDown } from "@material-ui/icons";

import Menu from "./Menu";
import SelectionTag from "./SelectionTag";

const Container = styled.div`
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : undefined)};

  .dropdown-button {
    font-family: unset;
    padding-left: 0;
    padding-right: 0;

    .dropdown-icon {
      color: ${({ theme, disabled }) =>
        disabled ? theme.fontDarkest : undefined};
    }
  }

  .popper {
    z-index: ${({ menuZIndex }) => menuZIndex};
  }
`;

const Body = styled(SelectionTag.Body)`
  display: flex;
  align-items: center;
  text-transform: none;
  padding-right: 0.5em;
`;

const DropdownTag = ({
  name,
  menuItems,
  menuZIndex = 1,
  disabled = false,
  title,
  onSelect,
  ...rest
}) => {
  // adapted from https://material-ui.com/components/menus/#menulist-composition
  const [isOpen, setOpen] = useState(false);
  const anchorRef = useRef(null);

  const handleToggle = () => setOpen(!isOpen);
  const handleClose = () => setOpen(false);
  const handleSelect = (item) => {
    onSelect(item);
    setOpen(false);
  };

  return (
    <Container menuZIndex={menuZIndex} disabled={disabled} title={title}>
      <Button
        classes={{ root: "dropdown-button" }}
        ref={anchorRef}
        onClick={handleToggle}
        disabled={disabled}
      >
        <Body disabled={disabled} {...rest}>
          {name} <ArrowDropDown className="dropdown-icon" />
        </Body>
      </Button>
      <Popper
        open={isOpen}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        className="popper"
      >
        <Menu
          autoFocusItem={isOpen}
          items={menuItems}
          onClose={handleClose}
          onSelect={handleSelect}
        />
      </Popper>
    </Container>
  );
};

DropdownTag.Body = Body;

export default DropdownTag;
