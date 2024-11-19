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
  Tooltip,
} from "@mui/material";
import React, { useCallback } from "react";
import { getColorByCode } from "../utils";

const DEFAULT_MAX_INLINE = 1;

export default function ActionsMenu(props: ActionsPropsType) {
  const { actions, maxInline = DEFAULT_MAX_INLINE, size } = props;

  if (actions.length <= maxInline) {
    return (
      <Stack direction="row" spacing={0.5} justifyContent="flex-start">
        {actions.map((action) => (
          <Action {...action} key={action.name} mode="inline" size={size} />
        ))}
      </Stack>
    );
  }

  return <ActionsOverflowMenu actions={actions} size={size} />;
}

function ActionsOverflowMenu(props: ActionsPropsType) {
  const { actions, size } = props;
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Box>
      <IconButton
        size="small"
        onClick={() => {
          setOpen(!open);
        }}
        ref={anchorRef}
        sx={size === "small" ? { p: 0 } : {}}
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
  const { label, name, onClick, icon, variant, mode, color, size, tooltip } =
    props;
  const resolvedColor = color ? getColorByCode(color) : undefined;

  const Icon = icon ? (
    <MuiIconFont name={icon} sx={{ color: resolvedColor }} />
  ) : null;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick?.(props, e);
    },
    [onClick, props]
  );

  const content =
    mode === "inline" ? (
      <Button
        variant={variant}
        startIcon={Icon}
        onClick={handleClick}
        sx={{ color: resolvedColor, padding: size === "small" ? 0 : undefined }}
      >
        {label}
      </Button>
    ) : (
      <MenuItem onClick={handleClick}>
        {Icon && <ListItemIcon>{Icon}</ListItemIcon>}
        <ListItemText sx={{ color: resolvedColor }}>
          {label || name}
        </ListItemText>
      </MenuItem>
    );

  return tooltip ? (
    <Tooltip title={tooltip}>
      <span>{content}</span>{" "}
      {/* Use <span> to wrap the child to avoid DOM issues */}
    </Tooltip>
  ) : (
    content
  );
}

type SizeType = "small" | "medium";

type ActionsPropsType = {
  actions: Array<ActionPropsType>;
  maxInline?: number;
  size?: SizeType;
};

type ActionPropsType = {
  name: string;
  label: string;
  onClick: (action: ActionPropsType, e: React.MouseEvent) => void;
  icon: string;
  variant: string;
  mode: "inline" | "menu";
  color?: string;
  size?: SizeType;
  tooltip: string | null;
};
