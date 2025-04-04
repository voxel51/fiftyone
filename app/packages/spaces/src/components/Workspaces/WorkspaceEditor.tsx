import {
  COLOR_OPTIONS,
  Dialog,
  MuiButton,
  Selection,
  TextField,
} from "@fiftyone/components";
import { executeOperator, useOperatorExecutor } from "@fiftyone/operators";
import { sessionSpaces } from "@fiftyone/state";
import { Delete } from "@mui/icons-material";
import {
  Box,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { useRecoilCallback, useRecoilState, useResetRecoilState } from "recoil";
import { workspaceEditorStateAtom } from "../../state";
import { useWorkspaces } from "./hooks";
import { LOAD_WORKSPACE_OPERATOR } from "./constants";

const SAVE_WORKSPACE_OPERATOR = "@voxel51/operators/save_workspace";
const DELETE_WORKSPACE_OPERATOR = "@voxel51/operators/delete_workspace";

export default function WorkspaceEditor() {
  const { reset } = useWorkspaces();
  const [state, setState] = useRecoilState(workspaceEditorStateAtom);
  const resetEditor = useResetRecoilState(workspaceEditorStateAtom);
  const { open, name, description, color, edit } = state;
  const getSessionSpaces = useRecoilCallback(({ snapshot }) => async () => {
    const spaces = await snapshot.getPromise(sessionSpaces);
    return spaces;
  });
  const colorObject = useMemo(() => {
    return COLOR_OPTIONS.find((c) => c.color === color);
  }, [color]);
  const [status, setStatus] = useState("");

  const handleClose = useCallback(resetEditor, [resetEditor]);

  const isSaving = status === "saving";
  const isDeleting = status === "deleting";

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Workspace Editor</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack>
            <TextField
              label="Name"
              size="small"
              defaultValue={name}
              fullWidth
              placeholder="Your workspace name"
              onChange={(e) => {
                setState((state) => ({ ...state, name: e.target.value }));
              }}
            />
          </Stack>
          <Stack>
            <TextField
              label="Description"
              size="small"
              defaultValue={description}
              fullWidth
              placeholder="Enter a description"
              multiline
              rows={5}
              onChange={(e) => {
                setState((state) => ({
                  ...state,
                  description: e.target.value,
                }));
              }}
            />
          </Stack>
          <Stack spacing={1}>
            <Typography color="text.secondary">Color</Typography>
            <Selection
              id="workspace-color"
              selected={colorObject ?? null}
              setSelected={({ color }) => {
                if (!color) {
                  throw new Error("no color defined");
                }
                setState((state) => ({ ...state, color }));
              }}
              items={COLOR_OPTIONS}
              hideActions
              readonly
              noBorder
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3 }}>
        <Box>
          {edit && (
            <MuiButton
              startIcon={<Delete color={isDeleting ? "disabled" : "error"} />}
              color="error"
              onClick={() => {
                setStatus("deleting");
                executeOperator(
                  DELETE_WORKSPACE_OPERATOR,
                  { names: [name] },
                  {
                    callback: (result) => {
                      if (!result.error) {
                        reset();
                        handleClose();
                        setStatus("");
                      }
                    },
                    skipOutput: true,
                  }
                );
              }}
              disabled={isDeleting}
              loading={isDeleting}
            >
              Delete
            </MuiButton>
          )}
        </Box>
        <Stack spacing={2} direction="row">
          <MuiButton onClick={handleClose} color="secondary" variant="outlined">
            Cancel
          </MuiButton>
          <MuiButton
            variant="contained"
            onClick={async () => {
              setStatus("saving");
              executeOperator(
                SAVE_WORKSPACE_OPERATOR,
                {
                  ...state,
                  current_name: edit ? state.oldName : undefined,
                  spaces: await getSessionSpaces(),
                },
                {
                  callback: (result) => {
                    if (!result.error) {
                      reset();
                      handleClose();
                      setStatus("");
                      if (!edit) {
                        executeOperator(
                          LOAD_WORKSPACE_OPERATOR,
                          {
                            name: state.name,
                          },
                          { skipOutput: true }
                        );
                      }
                    }
                  },
                  skipOutput: true,
                }
              );
            }}
            disabled={isSaving}
            loading={isSaving}
          >
            Save
          </MuiButton>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
