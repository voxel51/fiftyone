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
import * as fos from "@fiftyone/state";
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
import {
  COLOR_OPTIONS,
  DEFAULT_COLOR,
  COLOR_OPTIONS_MAP,
  DEFAULT_COLOR_OPTION,
} from "@fiftyone/components/src/components/Selection/SelectionColors";
import { shouldToggleBookMarkIconOnSelector } from "../../Actions/ActionsRow";

interface Props {
  savedViews: fos.State.SavedView[];
  onEditSuccess: (saveView: fos.State.SavedView, reload?: boolean) => void;
  onDeleteSuccess: (slug: string) => void;
  canEdit?: boolean;
}

export const viewDialogContent = atom({
  key: "viewDialogContent",
  default: {
    name: "",
    description: "",
    color: DEFAULT_COLOR,
    isCreating: true, // vs. editing
  },
});

export default function ViewDialog(props: Props) {
  const { onEditSuccess, onDeleteSuccess, savedViews = [], canEdit } = props;
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
    COLOR_OPTIONS_MAP[initialColor] || DEFAULT_COLOR_OPTION;

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
        COLOR_OPTIONS_MAP[viewContent.color] || DEFAULT_COLOR_OPTION;

      setColorOption({
        label: theColorOption?.id,
        color: theColorOption?.color,
        id: theColorOption?.id,
        description: "",
      });
    }
  }, [viewContent]);

  const view = useRecoilValue(fos.view);
  const extendedViewExists = useRecoilValue(shouldToggleBookMarkIconOnSelector);

  const {
    handleDeleteView,
    isDeletingSavedView,
    handleCreateSavedView,
    isCreatingSavedView,
    handleUpdateSavedView,
    isUpdatingSavedView,
  } = fos.useSavedViews();

  const resetValues = useCallback(() => {
    resetViewContent();
    setNameValue("");
    setDescriptionValue("");
    setColorOption(DEFAULT_COLOR_OPTION);
  }, []);

  const onDeleteView = useCallback(() => {
    handleDeleteView(nameValue, () => {
      resetValues();
      setIsOpen(false);
      onDeleteSuccess(nameValue);
    });
  }, [nameValue]);

  const onSaveView = useCallback(() => {
    if (isCreating) {
      handleCreateSavedView(
        nameValue,
        descriptionValue,
        colorOption.color || DEFAULT_COLOR,
        view,
        (saveView: fos.State.SavedView) => {
          resetValues();
          onEditSuccess(saveView, true);
          setIsOpen(false);
        }
      );
    } else {
      handleUpdateSavedView(
        initialName,
        nameValue,
        descriptionValue,
        colorOption.color || DEFAULT_COLOR,
        (saveView: fos.State.SavedView) => {
          resetValues();
          onEditSuccess(saveView, initialName !== nameValue);
          setIsOpen(false);
        }
      );
    }
  }, [view, nameValue, descriptionValue, colorOption?.color]);

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
            {!isCreating && canEdit && (
              <Button
                onClick={onDeleteView}
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
                border: `1px solid ${theme.text.tertiary}`,

                "&:hover": {
                  background: theme.background.level2,
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={onSaveView}
              disabled={
                isUpdatingSavedView ||
                isCreatingSavedView ||
                isDeletingSavedView ||
                !!nameError ||
                !nameValue ||
                (isCreating && !view?.length && !extendedViewExists) ||
                (initialName === nameValue &&
                  descriptionValue === initialDescription &&
                  colorOption?.color === initialColor)
              }
              sx={{
                background: "#FF6D04",
                color: theme.common.white,
                textTransform: "inherit",
                padding: "0.5rem 1.25rem",
                border: `1px solid ${theme.primary.plainBorder}`,
                marginLeft: "1rem",

                "&:hover": {
                  background: "#D54B00",
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
