import { DeleteOutline, EditOutlined } from "@mui/icons-material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import {
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import React from "react";
import ConfirmDelete from "../../components/ConfirmDelete";
import TooltipProvider from "../../../TooltipProvider";

export default function Actions(props) {
  const { onDelete, onEdit, readOnly } = props;
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const tooltipTitle = readOnly
    ? "You do not have permission to create scenarios"
    : null;

  return (
    <Stack>
      <IconButton onClick={handleClick}>
        <MoreVertIcon />
      </IconButton>
      <Menu
        id="actions-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        <TooltipProvider title={tooltipTitle}>
          <MenuItem
            onClick={() => {
              onEdit?.();
              handleClose();
            }}
            disabled={readOnly}
          >
            <ListItemIcon>
              <EditOutlined fontSize="small" color="secondary" />
            </ListItemIcon>
            <Typography color="secondary">Edit</Typography>
          </MenuItem>
        </TooltipProvider>
        <TooltipProvider title={tooltipTitle}>
          <MenuItem
            onClick={() => {
              setDeleteOpen(true);
              handleClose();
            }}
            disabled={readOnly}
            title={tooltipTitle}
          >
            <ListItemIcon>
              <DeleteOutline fontSize="small" color="error" />
            </ListItemIcon>
            <Typography color="error">Delete</Typography>
          </MenuItem>
        </TooltipProvider>
      </Menu>
      <ConfirmDelete
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDelete={onDelete}
        heading="Delete scenario?"
        body="Are you sure you want to delete this scenario? This action cannot be undone."
      />
    </Stack>
  );
}
