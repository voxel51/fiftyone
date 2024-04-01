import React from "react";
import {
  Button,
  ButtonGroup,
  ClickAwayListener,
  Grow,
  Paper,
  Popper,
  MenuItem,
  MenuList,
  ListItemText,
  Tooltip,
  ButtonProps,
} from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { onEnter } from "./utils";

const ButtonStylesOverrides: ButtonProps["sx"] = {
  color: (theme) => theme.palette.text.secondary,
  background: (theme) => theme.palette.background.viewBarButtons,
  border: "1px solid",
  borderColor: (theme) => `${theme.palette.divider}!important`,
  textTransform: "none",
  fontSize: "1rem",
  paddingBlockStart: 0,
  paddingBlockEnd: 0,
  "&:hover": {
    background: (theme) => theme.palette.primary.main,
    color: (theme) => theme.palette.common.white,
  },
};

export default function SplitButton({
  options,
  submitOnEnter,
  onSubmit,
  disabled,
  disabledReason,
}) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const hasMultipleOptions = options.length > 1;
  const selectedItem =
    options.find((option) => option.selected) ||
    options.find((option) => option.default) ||
    options[0];

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event: Event) => {
    if (
      anchorRef.current &&
      anchorRef.current.contains(event.target as HTMLElement)
    ) {
      return;
    }

    setOpen(false);
  };

  const handleSelect = (option) => {
    option.onSelect();
    setOpen(false);
  };

  const tooltipTitle = disabled ? disabledReason : null;

  return (
    <React.Fragment>
      <Tooltip title={tooltipTitle}>
        <ButtonGroup
          variant="contained"
          ref={anchorRef}
          aria-label="split button"
        >
          <Button
            size="small"
            disableRipple
            sx={ButtonStylesOverrides}
            disabled={disabled}
            onClick={onSubmit}
            onKeyUp={submitOnEnter ? onEnter(onSubmit) : null}
          >
            {selectedItem.label}
          </Button>
          {hasMultipleOptions && (
            <Button
              sx={{ ...ButtonStylesOverrides, borderLeft: 0, minWidth: 32 }}
              disableRipple
              size="small"
              aria-controls={open ? "split-button-menu" : undefined}
              aria-expanded={open ? "true" : undefined}
              aria-haspopup="menu"
              onClick={handleToggle}
              disabled={disabled}
            >
              <ArrowDropDownIcon />
            </Button>
          )}
        </ButtonGroup>
      </Tooltip>
      {hasMultipleOptions && (
        <Popper
          sx={{
            zIndex: 9999,
          }}
          open={open}
          anchorEl={anchorRef.current}
          role={undefined}
          transition
        >
          {({ TransitionProps, placement }) => (
            <Grow
              {...TransitionProps}
              style={{
                transformOrigin:
                  placement === "bottom" ? "center top" : "center bottom",
              }}
            >
              <Paper>
                <ClickAwayListener onClickAway={handleClose}>
                  <MenuList id="split-button-menu" autoFocusItem>
                    {options.map((option) => (
                      <MenuItem
                        key={option.id}
                        disabled={option.disabled}
                        selected={option.selected}
                        onClick={() => handleSelect(option)}
                      >
                        <ListItemText
                          sx={{
                            color: (theme) =>
                              option.selected
                                ? theme.palette.text.primary
                                : theme.palette.text.disabled,
                          }}
                          primary={option.choiceLabel || option.label}
                          secondary={option.description}
                        />
                      </MenuItem>
                    ))}
                  </MenuList>
                </ClickAwayListener>
              </Paper>
            </Grow>
          )}
        </Popper>
      )}
    </React.Fragment>
  );
}
