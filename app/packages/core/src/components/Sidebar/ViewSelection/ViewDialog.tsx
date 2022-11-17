import React, { useCallback, useEffect, useState } from "react";

import { Selection } from "@fiftyone/components";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
} from "recoil";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import { useTheme } from "@fiftyone/components";
import { viewDialogOpen } from ".";
import { DatasetViewOption } from "@fiftyone/components/src/components/Selection/Option";
import { useMutation } from "react-relay";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { stateSubscription, trueAtom, useSendEvent } from "@fiftyone/state";
import { useErrorHandler } from "react-error-boundary";
import {
  Box,
  NameInput,
  DescriptionInput,
  Label,
  InputContainer,
  DialogBody,
  ErrorText,
  ErrorBox,
} from "./styledComponents";
import { SavedView } from "@fiftyone/state";

export const COLOR_OPTIONS = [
  { id: "blue", label: "Blue", color: "#2970FF", description: "" },
  { id: "cyan", label: "Cyan", color: "#06AED4", description: "" },
  { id: "green", label: "Green", color: "#16B364", description: "" },
  { id: "yellow", label: "Yellow", color: "#FAC515", description: "" },
  { id: "orange", label: "Orange", color: "#EF6820", description: "" },
  { id: "red", label: "Red", color: "#F04438", description: "" },
  { id: "pink", label: "Pink", color: "#EE46BC", description: "" },
  { id: "purple", label: "Purple", color: "#7A5AF8", description: "" },
  { id: "gray", label: "Gray", color: "#667085", description: "" },
];

interface Props {
  savedViews: fos.State.SavedView[];
  onEditSuccess: (saveView?: SavedView, reload?: boolean) => void;
  onDeleteSuccess: () => void;
}

export const viewDialogContent = atom({
  key: "viewDialogContent",
  default: {
    name: "",
    description: "",
    color: COLOR_OPTIONS[0].id,
    isCreating: true, // vs. editing
  },
});

export default function ViewDialog(props: Props) {
  const { onEditSuccess, onDeleteSuccess, savedViews = [] } = props;
  const theme = useTheme();
  const [isOpen, setIsOpen] = useRecoilState<boolean>(viewDialogOpen);
  const viewContent = useRecoilValue(viewDialogContent);
  const resetViewContent = useResetRecoilState(viewDialogContent);
  const {
    name: initialName,
    description: initialDescription,
    color: initialColor,
    isCreating,
  } = viewContent;

  const [nameValue, setNameValue] = useState<string>(initialName);
  const [descriptionValue, setDescriptionValue] =
    useState<string>(initialDescription);

  const theColorOption =
    COLOR_OPTIONS.filter((color) => color.color === initialColor)?.[0] ||
    COLOR_OPTIONS[0];

  const [colorOption, setColorOption] = useState<DatasetViewOption>({
    label: theColorOption.id,
    color: theColorOption.color,
    id: theColorOption.id,
    description: "",
  });

  const savedViewNames = new Set(
    savedViews.map((sv: fos.State.SavedView) => sv.name.toLowerCase())
  );
  const nameExists =
    nameValue && nameValue !== initialName && savedViewNames.has(nameValue);
  const nameError = nameExists ? "Name already exists" : "";

  const title = isCreating ? "Create view" : "Edit view";

  useEffect(() => {
    if (viewContent.name) {
      setNameValue(viewContent.name);
      setDescriptionValue(viewContent.description);
      const theColorOption =
        COLOR_OPTIONS.filter(
          (color) => color.color === viewContent.color
        )?.[0] || COLOR_OPTIONS[0];

      setColorOption({
        label: theColorOption?.id,
        color: theColorOption?.color,
        id: theColorOption?.id,
        description: "",
      });
    }
  }, [viewContent]);

  // TODO: move to custom hooks
  const view = useRecoilValue(fos.view);
  const subscription = useRecoilValue(stateSubscription);
  const onError = useErrorHandler();
  const send = useSendEvent();
  const [saveView, savingView] = useMutation<foq.saveViewMutation>(
    foq.saveView
  );
  const [updateView] = useMutation<foq.updateSavedViewMutation>(
    foq.updateSavedView
  );
  const [deleteView] = useMutation<foq.deleteSavedViewMutation>(
    foq.deleteSavedView
  );
  const resetValues = useCallback(() => {
    resetViewContent();
    setNameValue("");
    setDescriptionValue("");
    setColorOption(COLOR_OPTIONS[0]);
  }, []);

  const handleDeleteView = useCallback(() => {
    if (nameValue) {
      send((session) =>
        deleteView({
          onError,
          variables: {
            viewName: nameValue,
            subscription,
            session,
          },
          onCompleted: () => {
            resetValues();
            onDeleteSuccess();
          },
        })
      );
      setIsOpen(false);
    }
  }, [nameValue]);

  const handleSaveView = useCallback(() => {
    if (nameValue) {
      if (isCreating && view?.length) {
        send((session) =>
          saveView({
            onError,
            variables: {
              viewName: nameValue,
              description: descriptionValue,
              color: colorOption?.color,
              subscription,
              session,
            },
            onCompleted: ({ saveView }) => {
              resetValues();
              onEditSuccess(saveView, true);
            },
          })
        );
      } else {
        send((session) =>
          updateView({
            onError,
            variables: {
              viewName: initialName,
              subscription,
              session,
              updatedInfo: {
                description: descriptionValue,
                color: colorOption?.color,
                name: nameValue,
              },
            },
            onCompleted: ({ updateSavedView }) => {
              resetValues();
              onEditSuccess(updateSavedView, initialName !== nameValue);
            },
          })
        );
      }
      setIsOpen(false);
    }
  }, [view, nameValue, descriptionValue, colorOption?.color, subscription]);

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsOpen(false);
        resetValues();
      }}
    >
      <DialogBody
        style={{
          background: theme.background.level1,
        }}
      >
        <DialogTitle
          alignItems="flex-start"
          width="100%"
          sx={{ padding: 3, paddingBottom: 1 }}
        >
          {title}
          <IconButton
            aria-label="close"
            onClick={() => {
              setIsOpen(false);
              resetValues();
            }}
            sx={{
              position: "absolute",
              right: 20,
              top: 20,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ paddingLeft: 3, paddingRight: 3, width: "100%" }}>
          <InputContainer>
            <Label>Name</Label>
            <NameInput
              placeholder="Your view name"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              error={nameError}
            />
            {nameError && <ErrorBox>{nameError}</ErrorBox>}
          </InputContainer>
          <InputContainer>
            <Label>Description</Label>
            <DescriptionInput
              rows={5}
              placeholder="Enter a description"
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
            />
          </InputContainer>
          <InputContainer>
            <Label>Color</Label>
            <Selection
              selected={colorOption}
              setSelected={(item) => setColorOption(item)}
              items={COLOR_OPTIONS}
              compact
              readonly
            />
          </InputContainer>
        </DialogContent>
        <DialogActions
          sx={{
            width: "100%",
            padding: "2rem",
          }}
        >
          <Box
            style={{
              justifyContent: "start",
            }}
          >
            {!isCreating && (
              <Button
                onClick={handleDeleteView}
                sx={{
                  background: theme.background.level1,
                  color: theme.text.primary,
                  textTransform: "inherit",
                  padding: "0.5rem 1.25rem",
                  width: "100px",
                  paddingLeft: "12px",
                }}
              >
                <DeleteIcon fontSize="small" color="error" />
                <ErrorText> Delete</ErrorText>
              </Button>
            )}
          </Box>
          <Box
            style={{
              justifyContent: "end",
            }}
          >
            <Button
              onClick={() => setIsOpen(false)}
              sx={{
                background: theme.background.level1,
                color: theme.text.primary,
                textTransform: "inherit",
                padding: "0.5rem 1.25rem",
                border: `1px solid ${theme.primary.plainBorder}`,
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={
                !!nameError ||
                !nameValue ||
                (isCreating && !view?.length) ||
                (initialName === nameValue &&
                  descriptionValue === initialDescription &&
                  colorOption?.color === initialColor)
              }
              sx={{
                background: theme.common.black,
                color: theme.common.white,
                textTransform: "inherit",
                padding: "0.5rem 1.25rem",
                border: `1px solid ${theme.primary.plainBorder}`,
                marginLeft: "1rem",

                "&:hover": {
                  background: theme.common.black,
                  color: theme.common.white,
                },

                "&:disabled": {
                  background: theme.text.tertiary,
                  color: theme.background.body,
                },
              }}
            >
              Save view
            </Button>
          </Box>
        </DialogActions>
      </DialogBody>
    </Dialog>
  );
}
