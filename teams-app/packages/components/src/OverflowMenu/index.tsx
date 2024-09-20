import { ItemWithPermission, usePermissionedItems } from "@fiftyone/hooks";
import { isNullish } from "@fiftyone/utilities";
import { MoreVert as MoreVertIcon } from "@mui/icons-material";
import {
  Box,
  BoxProps,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  Tooltip,
} from "@mui/material";
import { useMemo, useState } from "react";

type OverflowMenuItemProps = ItemWithPermission & {
  primaryText: string | React.ReactNode;
  IconComponent?: React.ReactNode;
  secondaryText?: string;
  onClick?: Function;
  disabled?: boolean;
  title?: string;
  hoverText?: string;
};

type OverflowMenuProps = {
  items: Array<OverflowMenuItemProps>;
  containerProps?: BoxProps;
  constrainEvent?: boolean;
  hideNotAllowed?: boolean;
};

export default function OverflowMenu({
  items,
  containerProps = {},
  constrainEvent,
  hideNotAllowed,
}: OverflowMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (constrainEvent) {
      event.preventDefault();
      event.stopPropagation();
    }
    const selectedItem = event.currentTarget;
    setAnchorEl(selectedItem);
  };
  const handleClose = (e) => {
    if (constrainEvent) {
      e.preventDefault();
      e.stopPropagation();
    }
    setAnchorEl(null);
  };

  const itemsWithDefaultLabel = useMemo(() => {
    return items.map((item) => {
      if (
        item.permission &&
        isNullish(item.permission.label) &&
        typeof item.primaryText === "string"
      ) {
        return {
          ...item,
          permission: {
            ...item.permission,
            label: item.primaryText.toLowerCase(),
          },
        };
      }
      return item;
    });
  }, [items]);

  const permissionedItems = usePermissionedItems<OverflowMenuItemProps>(
    itemsWithDefaultLabel,
    !hideNotAllowed
  );

  return (
    <Box {...containerProps}>
      <IconButton
        aria-label="more"
        id="long-button"
        aria-controls={open ? "long-menu" : undefined}
        aria-expanded={open ? "true" : undefined}
        aria-haspopup="true"
        onClick={handleClick}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        id="long-menu"
        MenuListProps={{ "aria-labelledby": "long-button" }}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        {permissionedItems.map((item, i) => {
          const {
            IconComponent,
            disabled,
            onClick,
            primaryText,
            secondaryText,
            title,
            hoverText,
          } = item;

          const MenuItemComponent = (
            <MenuItem
              key={`overflow-menu-item-${i}`}
              selected={false}
              disabled={disabled}
              onClick={(e) => {
                if (constrainEvent) {
                  e.preventDefault();
                  e.stopPropagation();
                }
                handleClose(e);
                if (onClick) onClick(e);
              }}
            >
              {IconComponent && <ListItemIcon>{IconComponent}</ListItemIcon>}
              <ListItemText>{primaryText}</ListItemText>
              {secondaryText && (
                <Typography variant="body2" color="text.secondary">
                  {secondaryText}
                </Typography>
              )}
            </MenuItem>
          );

          const text = useMemo(() => hoverText || "", [hoverText]);

          if (disabled) {
            return (
              <Box
                title={title}
                sx={{ cursor: "not-allowed" }}
                key={`menu-item-box-${i}`}
              >
                {MenuItemComponent}
              </Box>
            );
          }

          if (!text) {
            return (
              <Tooltip
                title={text}
                placement="bottom"
                key={`tooltip-item-${i}`}
              >
                {MenuItemComponent}
              </Tooltip>
            );
          }

          return MenuItemComponent;
        })}
      </Menu>
    </Box>
  );
}
