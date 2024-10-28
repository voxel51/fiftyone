import { useCreateGroup, useEditGroupInfo } from "@fiftyone/hooks";
import { Dialog } from "@fiftyone/teams-components";
import { groupInModalState } from "@fiftyone/teams-state";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent/DialogContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { FC, useCallback, useEffect } from "react";
import { useRecoilState } from "recoil";

interface Props {}

type Command = {
  name: string;
  description?: string;
  id?: string;
};

const UserGroupModal: FC<Props> = () => {
  const [showNameError, setShowNameError] = React.useState<string>("");
  const { createGroup, isCreatingGroup } = useCreateGroup();
  const { editGroup, isEditingGroup } = useEditGroupInfo();
  const [groupInModal, setGroupInModal] = useRecoilState(groupInModalState);
  const actionTitle = `${groupInModal === null ? "Create " : "Edit "} group`;
  const isOpen = groupInModal !== undefined;
  const handleClose = useCallback(() => {
    setGroupInModal(undefined);
  }, [setGroupInModal]);
  const [command, setCommand] = React.useState<Command>({
    name: groupInModal?.name || "",
    description: groupInModal?.description || "",
    id: groupInModal?.id,
  });

  useEffect(() => {
    setCommand({
      name: groupInModal?.name || "",
      description: groupInModal?.description || "",
      id: groupInModal?.id,
    });
  }, [groupInModal]);

  const handleNameError = useCallback(
    (error) => {
      // not perfect - we are planning to= improve error handling
      const alreadyExistsError = `${error}`.includes("already exists");
      if (alreadyExistsError) {
        setShowNameError("Name already exists");
      } else {
        setShowNameError("Bad name");
      }
    },
    [setShowNameError]
  );

  const actionBtnDisabled =
    isCreatingGroup || isEditingGroup || command.name.trim() === "";

  return (
    <Dialog
      title={actionTitle}
      open={isOpen}
      fullWidth
      hideActionButtons
      onClose={handleClose}
    >
      <DialogContent sx={{ p: 0 }}>
        <Typography variant="body1" noWrap paddingLeft={0.5} pb={1} pl={0}>
          Name
        </Typography>
        <TextField
          size="small"
          autoFocus
          required
          aria-label="group-name"
          fullWidth
          variant="outlined"
          value={command.name}
          placeholder="Group name"
          error={!!showNameError}
          onChange={(e) => {
            setCommand({ ...command, name: e.target.value });
            setShowNameError(e.target.value.trim() === "" ? "Requred" : "");
          }}
          sx={{ paddingBottom: !!showNameError ? "none" : "1rem" }}
        />
        {!!showNameError && (
          <Typography
            variant="subtitle2"
            color="error"
            sx={{
              transition: "height 0.3s ease-in",
              overflow: "hidden",
              paddingBottom: "1rem",
            }}
          >
            {showNameError}
          </Typography>
        )}

        <Typography variant="body1" noWrap paddingLeft={0.5} pb={1} pl={0}>
          Description
        </Typography>
        <TextField
          autoFocus
          aria-label="group-description"
          placeholder="Enter a description..."
          fullWidth
          variant="outlined"
          multiline
          value={command?.description}
          rows={2}
          sx={{ paddingBottom: "1rem" }}
          onChange={(e) => {
            setCommand({ ...command, description: e.target.value });
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant="outlined">
          Cancel
        </Button>
        <Button
          type="submit"
          onClick={() => {
            const { name, id, description = "" } = command;
            if (groupInModal?.id) {
              // edit
              editGroup({
                identifier: id,
                name,
                description,
                onComplete: handleClose,
                onHandleError: (error) => {
                  handleNameError(error);
                },
              });
            } else {
              // create
              createGroup({
                name,
                description,
                onComplete: handleClose,
                onHandleError: (error) => {
                  handleNameError(error);
                },
              });
            }
          }}
          variant="contained"
          disabled={actionBtnDisabled}
        >
          {actionTitle}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserGroupModal;
