import React, { useState } from "react";

import { Add } from "@mui/icons-material";
import styled from "styled-components";

import { Selection } from "@fiftyone/components";
import { filter } from "lodash";
import { atom, useRecoilState, useRecoilValue } from "recoil";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useTheme } from "@fiftyone/components";
import { viewDialogOpen } from ".";
import { SelectionItemProps } from "@fiftyone/components/src/components/Selection/Option";

const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

const TextContainer = styled.div`
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.text.primary};
`;
const SecondaryContainer = styled(TextContainer)`
  color: ${({ theme }) => theme.text.secondary};
`;

const DialogBody = styled(Box)`
  flex-direction: column;
  width: 500px;
`;

const InputContainer = styled(Box)`
  flex-direction: column;
  padding: 0.5rem 0;
`;

const Label = styled(SecondaryContainer)`
  font-size: 1rem;
`;

const DescriptionInput = styled.textarea`
  resize: none;
  width: 100%;
  margin: 0.5rem 0.75rem;
  border-radius: 4px;
  padding: 0.5rem;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  color: ${({ theme }) => theme.text.primary};
  background: ${({ theme }) => theme.background.level1};
  font-family: "Palanquin", sans-serif;

  &:focus {
    border: 1px solid ${({ theme }) => theme.primary.plainBorder};
    outline: none;
  }
`;

const NameInput = styled.input`
  width: 100%;
  margin: 0.5rem 0.75rem;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  padding: 0.5rem;
  color: ${({ theme }) => theme.text.primary};
  background: ${({ theme }) => theme.background.level1};
  font-family: "Palanquin", sans-serif;

  &:focus {
    border: 1px solid ${({ theme }) => theme.primary.plainBorder};
    outline: none;
  }
`;

interface Props {}

export const viewDialogContent = atom({
  key: "viewDialogContent",
  default: {
    name: "",
    description: "",
    color: "green",
    isCreating: true, // vs. editing
  },
});

const COLOR_OPTIONS = [
  { id: "Green", label: "Green", color: "green" },
  { id: "Red", label: "Red", color: "red" },
  { id: "Blue", label: "Blue", color: "blue" },
  { id: "Yellow", label: "Yellow", color: "yellow" },
];

export default function ViewDialog(props: Props) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useRecoilState<boolean>(viewDialogOpen);
  const {
    name: initialName,
    description: initialDescription,
    color: initialColor,
    isCreating,
  } = useRecoilValue(viewDialogContent);

  const [nameValue, setNameValue] = useState<string>(initialName);
  const [descriptionValue, setDescriptionValue] =
    useState<string>(initialDescription);
  const [colorOption, setColorOption] = useState<SelectionItemProps>({
    label: initialName,
    description: initialDescription,
    color: initialColor,
    id: initialName,
  });

  const title = isCreating ? "Create view" : "Edit view";

  return (
    <Dialog open={isOpen} onClose={() => setIsOpen(false)}>
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
            onClick={() => setIsOpen(false)}
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
          <SecondaryContainer>
            Everyone with edit access to this database can edit this view.
          </SecondaryContainer>
          <InputContainer>
            <Label>Name</Label>
            <NameInput
              placeholder="Your view name"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
            />
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
        <DialogActions>
          <Button onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={() => console.log("subscribe")}>Subscribe</Button>
        </DialogActions>
      </DialogBody>
    </Dialog>
  );
}
