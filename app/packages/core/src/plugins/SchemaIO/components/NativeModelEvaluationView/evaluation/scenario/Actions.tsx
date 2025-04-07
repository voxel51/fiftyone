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

export default function Actions(props) {
  const { onDelete, onEdit } = props;
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

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
        <MenuItem
          onClick={() => {
            onEdit?.();
            handleClose();
          }}
        >
          <ListItemIcon>
            <EditOutlined fontSize="small" color="secondary" />
          </ListItemIcon>
          <Typography color="secondary">Edit</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDeleteOpen(true);
            handleClose();
          }}
        >
          <ListItemIcon>
            <DeleteOutline fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">Delete</Typography>
        </MenuItem>
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
