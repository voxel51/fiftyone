import { ColoredDot, Popout, scrollable } from "@fiftyone/components";
import { Add, AutoAwesomeMosaicOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
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
import { useRecoilValue, useSetRecoilState } from "recoil";
import { workspaceEditorStateAtom } from "../../state";
import Workspace from "./Workspace";
import WorkspaceEditor from "./WorkspaceEditor";
import { useWorkspaces, useWorkspacePermission } from "./hooks";
import { sessionSpaces } from "@fiftyone/state";
import { UNSAVED_WORKSPACE_COLOR } from "./constants";

export default function Workspaces() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { workspaces, loadWorkspace, initialized, listWorkspace } =
    useWorkspaces();
  const setWorkspaceEditorState = useSetRecoilState(workspaceEditorStateAtom);
  const { canEdit, disabledInfo } = useWorkspacePermission();
  const sessionSpacesState = useRecoilValue(sessionSpaces);
  const currentWorkspaceName = sessionSpacesState._name;

  const currentWorkspace = useMemo(() => {
    return workspaces.find((space) => space.name === currentWorkspaceName);
  }, [workspaces, currentWorkspaceName]);

  const items = useMemo(() => {
    return workspaces.filter((space) =>
      space.name.toLowerCase().includes(input.toLowerCase())
    );
  }, [workspaces, input]);

  useEffect(() => {
    if (!initialized) {
      listWorkspace();
    }
  }, [open, initialized, listWorkspace]);

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
          pr: "0.75rem",
        }}
        endIcon={<AutoAwesomeMosaicOutlined sx={{ fontSize: 18 }} />}
      >
        {!initialized && <Skeleton width={64} />}
        {initialized && (
          <ColoredDot
            color={currentWorkspace?.color || UNSAVED_WORKSPACE_COLOR}
          />
        )}
        {initialized && (currentWorkspace?.name || "Unsaved")}
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
                      <Workspace
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
                      cursor: !canEdit ? "not-allowed" : undefined,
                    }}
                    title={disabledInfo}
                  >
                    <ListItemButton
                      component="a"
                      sx={{ py: 0.5, pr: 0.5 }}
                      disabled={!canEdit}
                      onClick={() => {
                        if (!canEdit) return;
                        setOpen(false);
                        setWorkspaceEditorState((state) => ({
                          ...state,
                          name: input,
                          open: true,
                        }));
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: "auto" }}>
                        <Add
                          sx={{
                            color: (theme) => theme.palette.text.primary,
                            mr: 0.5,
                          }}
                        />
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
