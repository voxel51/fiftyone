import { TooltipProvider } from "@fiftyone/components";
import { useMutation } from "@fiftyone/state";
import { DeleteOutline, MoreVert } from "@mui/icons-material";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import React, { useState } from "react";
import { useSetReverbState } from "@fiftyone/reverb";
import { openModelEvalDialog, selectedModelEvaluation } from "./utils";

export default function ActionMenu(props: ActionMenuProps) {
  const { canDelete } = props;
  const setOpenModelEvalDialog = useSetReverbState(openModelEvalDialog);
  const setEvaluation = useSetReverbState(selectedModelEvaluation);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };
  const [enable, message] = useMutation(canDelete, "delete evaluation");

  return (
    <Box>
      <IconButton key={props.evaluationName} onClick={handleOpen}>
        <MoreVert />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <TooltipProvider title={message}>
          <MenuItem
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              event.preventDefault();
              setEvaluation(props.evaluationName);
              setOpenModelEvalDialog(true);
              setAnchorEl(null);
            }}
            disabled={!enable}
            title={message}
          >
            <ListItemIcon>
              <DeleteOutline fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText
              primary="Delete"
              primaryTypographyProps={{ color: "error" }}
            />
          </MenuItem>
        </TooltipProvider>
      </Menu>
    </Box>
  );
}

type ActionMenuProps = {
  evaluationName: string;
  canDelete: boolean;
};
