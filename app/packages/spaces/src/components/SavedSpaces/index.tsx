import { Popout, scrollable } from "@fiftyone/components";
import { Add, AutoAwesomeMosaicOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
} from "@mui/material";
import "allotment/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { useSetRecoilState } from "recoil";
import { workspaceEditorStateAtom } from "../../state";
import SavedSpace from "./SavedSpace";
import WorkspaceEditor from "./WorkspaceEditor";
import { useSavedSpaces } from "./hooks";

export default function SavedSpaces() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { savedSpaces, loadWorkspace, initialized, listWorkspace } =
    useSavedSpaces();
  const setWorkspaceEditorState = useSetRecoilState(workspaceEditorStateAtom);

  const items = useMemo(() => {
    return savedSpaces.filter((space) =>
      space.name.toLowerCase().includes(input.toLowerCase())
    );
  }, [savedSpaces, input]);

  useEffect(() => {
    if (open && !initialized) {
      listWorkspace();
    }
  }, [open, initialized]);

  return (
    <Box>
      <Button
        size="small"
        onClick={() => {
          setOpen(!open);
        }}
        sx={{
          position: "absolute",
          right: 5,
          zIndex: 1,
          color: (theme) => theme.palette.text.secondary,
          fontSize: 14,
        }}
        endIcon={
          <AutoAwesomeMosaicOutlined
            sx={{
              color: (theme) => theme.palette.primary.main,
              fontSize: 18,
            }}
          />
        }
      >
        Unsaved
      </Button>
      {open && (
        <Popout
          onClose={() => setOpen(false)}
          style={{
            minWidth: "300px",
            position: "absolute",
            top: "22px",
            right: "0px",
            padding: "0",
          }}
        >
          <Box>
            <TextField
              size="small"
              fullWidth
              placeholder="Search workspaces.."
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setInput(e.target.value)
              }
              sx={{ p: 1 }}
              value={input}
            />
            {!initialized && (
              <Stack spacing={1} sx={{ px: 2, pb: 1 }}>
                <Skeleton height={32} />
                <Skeleton height={32} />
                <Skeleton height={32} />
              </Stack>
            )}
            {initialized && (
              <Box>
                {items.length > 0 && (
                  <List
                    sx={{ py: 0, maxHeight: "40vh", overflow: "auto" }}
                    className={scrollable}
                  >
                    {items.map((space) => (
                      <SavedSpace
                        key={space.id}
                        onEdit={() => {
                          setOpen(false);
                        }}
                        onClick={(name) => {
                          setOpen(false);
                          loadWorkspace(name);
                        }}
                        {...space}
                      />
                    ))}
                  </List>
                )}
                <List sx={{ py: 0 }}>
                  <ListItem
                    sx={{
                      p: 0,
                      background: (theme) => theme.palette.background.paper,
                      "&:hover": {
                        ".MuiStack-root": { visibility: "visible" },
                      },
                    }}
                  >
                    <ListItemButton
                      component="a"
                      sx={{ py: 0.5, pr: 0.5 }}
                      onClick={() => {
                        setOpen(false);
                        setWorkspaceEditorState((state) => ({
                          ...state,
                          name: input,
                          open: true,
                        }));
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: "auto" }}>
                        <Add />
                      </ListItemIcon>
                      <ListItemText
                        primary={"Save current spaces as a workspace"}
                      />
                    </ListItemButton>
                  </ListItem>
                </List>
              </Box>
            )}
          </Box>
        </Popout>
      )}
      <WorkspaceEditor />
    </Box>
  );
}
