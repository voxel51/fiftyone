import { Popout, scrollable } from "@fiftyone/components";
import { AutoAwesomeMosaicOutlined, Save } from "@mui/icons-material";
import { Box, List, Stack, TextField, Typography } from "@mui/material";
import "allotment/dist/style.css";
import { useMemo, useState } from "react";
import { IconButton } from "../../AppModules";
import SavedSpace from "./SavedSpace";
import { useSavedSpaces } from "./hooks";

export default function SavedSpaces() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { savedSpaces, addSavedSpace, deleteSavedSpace, onUpdate } =
    useSavedSpaces();

  const items = useMemo(() => {
    return savedSpaces.filter((space) =>
      space.name.toLowerCase().includes(input.toLowerCase())
    );
  }, [savedSpaces, input]);

  const canSaveSpace = useMemo(() => {
    return input.trim().length && items.every((space) => space.name !== input);
  }, [items, input]);

  // dev feature flag
  if (localStorage.getItem("savedSpaces") === null) return null;

  return (
    <Box>
      <IconButton
        sx={{ position: "absolute", right: 0, zIndex: 1 }}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <AutoAwesomeMosaicOutlined
          sx={{
            color: (theme) => theme.palette.text.secondary,
            fontSize: 18,
            mx: 1,
            my: 0.25,
          }}
        />
      </IconButton>
      {open && (
        <Popout
          style={{
            minWidth: "350px",
            position: "absolute",
            top: "22px",
            right: "8px",
            zIndex: 1,
          }}
        >
          <Box sx={{ pt: 1.5, pb: 1, px: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Type to search or create saved layout"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setInput(e.target.value)
              }
              InputProps={{
                endAdornment: (
                  <Stack>
                    <IconButton
                      disabled={!canSaveSpace}
                      title="Save current spaces state"
                    >
                      <Save
                        color={canSaveSpace ? "primary" : "secondary"}
                        sx={{ fontSize: 18 }}
                        onClick={() => {
                          addSavedSpace(input);
                          setInput("");
                        }}
                      />
                    </IconButton>
                  </Stack>
                ),
              }}
              value={input}
            />
            <List
              sx={{ pb: 0, maxHeight: "40vh", overflow: "auto" }}
              className={scrollable}
            >
              {items.map((space) => (
                <SavedSpace
                  key={space.id}
                  onDelete={deleteSavedSpace}
                  onUpdate={onUpdate}
                  {...space}
                />
              ))}
              {items.length === 0 && (
                <Typography
                  sx={{ py: 2, textAlign: "center" }}
                  color="text.secondary"
                >
                  {input ? "No saved spaces found" : "No saved spaces yet"}
                </Typography>
              )}
            </List>
          </Box>
        </Popout>
      )}
    </Box>
  );
}
