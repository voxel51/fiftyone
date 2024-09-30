import { ColoredDot, Popout, scrollable } from "@fiftyone/components";
import { canEditWorkspaces, sessionSpaces } from "@fiftyone/state";
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
import { UNSAVED_WORKSPACE_COLOR } from "./constants";
import { useWorkspaces } from "./hooks";

export default function Workspaces() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const {
    workspaces,
    loadWorkspace,
    initialized,
    listWorkspace,
    canInitialize,
  } = useWorkspaces();
  const setWorkspaceEditorState = useSetRecoilState(workspaceEditorStateAtom);
  const canEditWorkSpace = useRecoilValue(canEditWorkspaces);
  const disabled = canEditWorkSpace.enabled !== true;
  const disabledMsg = canEditWorkSpace.message;
  const sessionSpacesState = useRecoilValue(sessionSpaces);
  const currentWorkspaceName = sessionSpacesState._name;

  const currentWorkspace = useMemo(() => {
    return workspaces.find((space) => space.name === currentWorkspaceName);
  }, [workspaces, currentWorkspaceName]);

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((space) =>
      space.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [workspaces, searchTerm]);

  useEffect(() => {
    if (!initialized && canInitialize) {
      listWorkspace();
    }
  }, [open, initialized, listWorkspace, canInitialize]);

  if (!canInitialize) return null;

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
                setSearchTerm(e.target.value)
              }
              sx={{ p: 1 }}
              value={searchTerm}
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
                {filteredWorkspaces.length > 0 && (
                  <List
                    sx={{ py: 0, maxHeight: "40vh", overflow: "auto" }}
                    className={scrollable}
                  >
                    {filteredWorkspaces.map((space) => (
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
                      cursor: disabled ? "not-allowed" : undefined,
                    }}
                    title={disabledMsg}
                  >
                    <ListItemButton
                      component="a"
                      sx={{ py: 0.5, pr: 0.5 }}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        setOpen(false);
                        setWorkspaceEditorState((state) => ({
                          ...state,
                          name: searchTerm,
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
