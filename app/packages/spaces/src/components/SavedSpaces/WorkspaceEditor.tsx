import {
  COLOR_OPTIONS,
  Dialog,
  Selection,
  TextField,
} from "@fiftyone/components";
import { Delete } from "@mui/icons-material";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useMemo } from "react";
import { useRecoilCallback, useRecoilState, useResetRecoilState } from "recoil";
import { workspaceEditorStateAtom } from "../../state";
import { useOperatorExecutor } from "@fiftyone/operators";
import { sessionSpaces } from "@fiftyone/state";
import { useSavedSpaces } from "./hooks";

export default function WorkspaceEditor() {
  const { reset } = useSavedSpaces();
  const [state, setState] = useRecoilState(workspaceEditorStateAtom);
  const resetEditor = useResetRecoilState(workspaceEditorStateAtom);
  const { open, name, description, color, edit } = state;
  const saveOperator = useOperatorExecutor("@voxel51/operators/save_workspace");
  const deleteOperator = useOperatorExecutor(
    "@voxel51/operators/delete_workspace"
  );
  const getSessionSpaces = useRecoilCallback(({ snapshot }) => async () => {
    const spaces = await snapshot.getPromise(sessionSpaces);
    return spaces;
  });
  const colorObject = useMemo(() => {
    return COLOR_OPTIONS.find((c) => c.color === color);
  }, [color]);

  const handleClose = useCallback(resetEditor, [resetEditor]);

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
              selected={colorObject}
              setSelected={(color) => {
                setState((state) => ({ ...state, color: color.color }));
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
            <Button
              startIcon={<Delete color="error" />}
              color="error"
              onClick={() => {
                deleteOperator.execute({ name });
                reset();
                handleClose();
              }}
            >
              Delete
            </Button>
          )}
        </Box>
        <Stack spacing={2} direction="row">
          <Button onClick={handleClose} color="secondary" variant="outlined">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              saveOperator.execute({
                ...state,
                current_name: edit ? state.oldName : undefined,
                spaces: await getSessionSpaces(),
              });
              reset();
              handleClose();
            }}
          >
            Save
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
