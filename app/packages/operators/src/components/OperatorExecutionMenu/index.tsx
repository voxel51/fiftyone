import { Menu, MenuItem, Stack, Typography } from "@mui/material";
import { OperatorExecutionOption } from "../../state";
import ExecutionOptionItem from "../../ExecutionOptionItem";

/**
 * Component which provides a context menu for executing an operator using a
 * specified execution target.
 *
 * @param anchor Element to use as context menu anchor
 * @param open If true, context menu will be visible
 * @param onClose Callback for context menu close events
 * @param executionOptions List of operator execution options
 * @param onClick Callback for an option being clicked
 * @param insideModal If true, elevate z-index to appear above modals
 * @param anchorOrigin Controls where the menu attaches to the anchor element
 * @param transformOrigin Controls which point of the menu aligns with the anchor
 */
export const OperatorExecutionMenu = ({
  anchor,
  open,
  onClose,
  executionOptions,
  onOptionClick,
  insideModal = false,
  anchorOrigin,
  transformOrigin,
}: {
  anchor?: Element | null;
  open: boolean;
  onClose: () => void;
  executionOptions: OperatorExecutionOption[];
  onOptionClick?: (option: OperatorExecutionOption) => void;
  insideModal?: boolean;
  anchorOrigin?: {
    vertical: "top" | "bottom" | "center";
    horizontal: "left" | "right" | "center";
  };
  transformOrigin?: {
    vertical: "top" | "bottom" | "center";
    horizontal: "left" | "right" | "center";
  };
}) => {
  return (
    <Menu
      anchorEl={anchor}
      open={open}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
      sx={{
        // Elevate z-index above dialogs (1300) when inside a modal
        zIndex: insideModal ? 1800 : undefined,
      }}
    >
      {executionOptions.map((target) => (
        <Item
          key={target.id}
          target={target}
          disabled={target.isDisabledSchedule || !target.onClick}
          onClose={onClose}
          onOptionClick={onOptionClick}
        />
      ))}
    </Menu>
  );
};

export default OperatorExecutionMenu;

function Item({ target, disabled, onClose, onOptionClick }) {
  return (
    <MenuItem
      key={target.id}
      onClick={() => {
        if (disabled) return;
        onClose?.();
        onOptionClick?.(target);
        target.onClick();
      }}
      sx={{ cursor: disabled ? "default" : "pointer" }}
    >
      <Stack direction="column" spacing={1}>
        <Typography fontWeight="bold">
          <ExecutionOptionItem
            label={target.choiceLabel ?? target.label}
            tag={target.tag}
            disabled={disabled}
          />
        </Typography>
        <Typography color="secondary">{target.description}</Typography>
      </Stack>
    </MenuItem>
  );
}
