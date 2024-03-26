import { Check, Close, Delete, Edit } from "@mui/icons-material";
import {
  IconButton,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
} from "@mui/material";
import "allotment/dist/style.css";
import { useState } from "react";

export default function SavedSpace(props: SavedSpacePropsType) {
  const { name, id, onDelete, onUpdate } = props;
  const [input, setInput] = useState(name);
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <ListItem
      sx={{
        p: 0,
        background: "#2e2e2e",
        borderRadius: 1,
        mb: 0.5,
        "&:hover": { ".MuiStack-root": { visibility: "visible" } },
      }}
    >
      {mode === "edit" && (
        <TextField
          focused
          size="small"
          fullWidth
          defaultValue={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setInput(e.target.value)
          }
          InputProps={{
            endAdornment: (
              <Stack direction="row">
                <IconButton>
                  <Close
                    color="secondary"
                    sx={{ fontSize: 18 }}
                    onClick={() => {
                      setInput("");
                      setMode("view");
                    }}
                  />
                </IconButton>
                <IconButton>
                  <Check
                    color="primary"
                    sx={{ fontSize: 18 }}
                    onClick={() => {
                      onUpdate(id, input);
                      setInput("");
                      setMode("view");
                    }}
                  />
                </IconButton>
              </Stack>
            ),
          }}
        />
      )}
      {mode === "view" && (
        <ListItemButton component="a" sx={{ py: 0.5, pr: 0.5 }}>
          <ListItemText primary={name} />
          <Stack direction="row" spacing={0} sx={{ visibility: "hidden" }}>
            <IconButton>
              <Edit
                color="secondary"
                sx={{ fontSize: 18 }}
                onClick={() => {
                  setMode("edit");
                }}
              />
            </IconButton>
            <IconButton>
              <Delete
                color="error"
                sx={{ fontSize: 18 }}
                onClick={() => {
                  onDelete(id);
                }}
              />
            </IconButton>
          </Stack>
        </ListItemButton>
      )}
    </ListItem>
  );
}

type SavedSpacePropsType = {
  name: string;
  id: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, value: string) => void;
};
