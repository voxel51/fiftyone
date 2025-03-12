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
import { useSetRecoilState } from "recoil";
import { openModelEvalDialog, selectedModelEvaluation } from "./utils";

type ActionMenuProps = {
  evaluationName: string;
};

const ActionMenu: React.FC<ActionMenuProps> = (props) => {
  const setOpenModelEvalDialog = useSetRecoilState(openModelEvalDialog);
  const setEvaluation = useSetRecoilState(selectedModelEvaluation);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };

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
        {/* <MenuItem
        onClick={() => {
          // Handle re-evaluate action
          handleReEvaluate();
          setAnchorEl(null);
        }}
      >
        <ListItemIcon>
          <Refresh fontSize="small" />
        </ListItemIcon>
        <ListItemText>Re-evaluate</ListItemText>
      </MenuItem> */}
        <MenuItem
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            event.preventDefault();
            setEvaluation(props.evaluationName);
            setOpenModelEvalDialog(true);
            setAnchorEl(null);
          }}
        >
          <ListItemIcon>
            <DeleteOutline fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText
            primary="Delete"
            primaryTypographyProps={{ color: "error" }}
          />
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default ActionMenu;
