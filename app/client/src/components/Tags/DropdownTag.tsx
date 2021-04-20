import React, { useRef, useState } from "react";
import styled from "styled-components";

import { Button, Popper } from "@material-ui/core";
import { ArrowDropDown } from "@material-ui/icons";

import Menu from "../Menu";
import SelectionTag from "./SelectionTag";
import { useOutsideClick } from "../../utils/hooks";

const Container = styled.div`
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : undefined)};

  .dropdown-button {
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

const DropdownTag = React.memo(
  ({
    name,
    menuItems,
    menuZIndex = 1,
    disabled = false,
    title,
    onSelect,
    onOpen = () => {},
    onClose = () => {},
    ...rest
  }) => {
    // adapted from https://material-ui.com/components/menus/#menulist-composition
    const [isOpen, setOpen] = useState(false);
    const anchorRef = useRef(null);
    const containerRef = useRef(null);

    const handleToggle = () => {
      setOpen(!isOpen);
      if (isOpen) {
        onClose();
      } else {
        onOpen();
      }
    };

    const handleClose = () => {
      // setOpen(false);
      onClose();
    };
    const handleSelect = (item) => {
      onSelect(item);
      setOpen(false);
    };

    useOutsideClick(containerRef, () => {
      setOpen(false);
    });

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
          ref={containerRef}
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
  }
);

DropdownTag.Body = Body;

export default DropdownTag;
