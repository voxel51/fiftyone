import { MuiIconFont } from "@fiftyone/components";
import { MoreVert } from "@mui/icons-material";
import {
  Box,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
} from "@mui/material";
import React, { useCallback } from "react";

const DEFAULT_MAX_INLINE = 1;

export default function ActionsMenu(props: ActionsPropsType) {
  const { actions, maxInline = DEFAULT_MAX_INLINE } = props;

  if (actions.length === maxInline) {
    return (
      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
        {actions.map((action) => (
          <Action {...action} key={action.name} mode="inline" />
        ))}
      </Stack>
    );
  }

  return <ActionsOverflowMenu actions={actions} />;
}

function ActionsOverflowMenu(props: ActionsPropsType) {
  const { actions } = props;
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Box>
      <IconButton
        onClick={() => {
          setOpen(!open);
        }}
        ref={anchorRef}
      >
        <MoreVert />
      </IconButton>
      <Menu open={open} onClose={handleClose} anchorEl={anchorRef.current}>
        {actions.map((action) => {
          const { name, onClick } = action;
          return (
            <Action
              key={name}
              {...action}
              mode="menu"
              onClick={(action, e) => {
                handleClose();
                onClick?.(action, e);
              }}
            />
          );
        })}
      </Menu>
    </Box>
  );
}

function Action(props: ActionPropsType) {
  const { label, name, onClick, icon, variant, mode } = props;

  const Icon = icon ? <MuiIconFont name={icon} /> : null;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick?.(props, e);
    },
    [onClick, props]
  );

  return mode === "inline" ? (
    <Button variant={variant} startIcon={Icon} onClick={handleClick}>
      {label}
    </Button>
  ) : (
    <MenuItem onClick={handleClick}>
      {Icon && <ListItemIcon>{Icon}</ListItemIcon>}
      <ListItemText>{label || name}</ListItemText>
    </MenuItem>
  );
}

type ActionsPropsType = {
  actions: Array<ActionPropsType>;
  maxInline?: number;
};

type ActionPropsType = {
  name: string;
  label: string;
  onClick: (action: ActionPropsType, e: React.MouseEvent) => void;
  icon: string;
  variant: string;
  mode: "inline" | "menu";
};
