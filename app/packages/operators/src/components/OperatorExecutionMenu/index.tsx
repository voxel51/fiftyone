import { Menu, MenuItem, Stack, Typography } from "@mui/material";
import React from "react";
import { OperatorExecutionOption } from "../../state";

/**
 * Component which provides a context menu for executing an operator using a
 * specified execution target.
 *
 * @param anchor Element to use as context menu anchor
 * @param open If true, context menu will be visible
 * @param onClose Callback for context menu close events
 * @param executionOptions List of operator execution options
 * @param onClick Callback for an option being clicked
 */
export const OperatorExecutionMenu = ({
  anchor,
  open,
  onClose,
  executionOptions,
  onOptionClick,
}: {
  anchor?: Element | null;
  open: boolean;
  onClose: () => void;
  executionOptions: OperatorExecutionOption[];
  onOptionClick?: (option: OperatorExecutionOption) => void;
}) => {
  return (
    <Menu anchorEl={anchor} open={open} onClose={onClose}>
      {executionOptions.map((target) => (
        <MenuItem
          key={target.id}
          onClick={() => {
            onClose?.();
            onOptionClick?.(target);
            target.onClick();
          }}
        >
          <Stack direction="column" spacing={1}>
            <Typography fontWeight="bold">
              {target.choiceLabel ?? target.label}
            </Typography>
            <Typography color="secondary">{target.description}</Typography>
          </Stack>
        </MenuItem>
      ))}
    </Menu>
  );
};

export default OperatorExecutionMenu;
