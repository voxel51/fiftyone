import { Edit } from "@mui/icons-material";
import {
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
} from "@mui/material";
import "allotment/dist/style.css";
import { useSetRecoilState } from "recoil";
import { workspaceEditorStateAtom } from "../../state";
import { ColoredDot } from "@fiftyone/components";

export default function SavedSpace(props: SavedSpacePropsType) {
  const { name, description, color, onClick, onEdit } = props;
  const setWorkspaceEditorState = useSetRecoilState(workspaceEditorStateAtom);

  return (
    <ListItem
      sx={{
        p: 0,
        background: (theme) => theme.palette.background.body,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        "&:hover": { ".MuiStack-root": { visibility: "visible" } },
      }}
      title={description}
    >
      <ListItemButton
        component="a"
        sx={{ py: 0.5, pr: 0.5 }}
        onClick={() => {
          if (onClick) onClick(name);
        }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          <ColoredDot color={color} />
        </ListItemIcon>
        <ListItemText primary={name} />
        <Stack direction="row" spacing={0} sx={{ visibility: "hidden" }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setWorkspaceEditorState((state) => ({
                ...state,
                open: true,
                edit: true,
                oldName: name,
                name,
                description,
                color,
              }));
              onEdit();
            }}
          >
            <Edit color="secondary" sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </ListItemButton>
    </ListItem>
  );
}

type SavedSpacePropsType = {
  name: string;
  color: string;
  description: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, value: string) => void;
  onClick: (name: string) => void;
  onEdit: () => void;
};
