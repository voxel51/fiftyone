import React, { useState } from "react";

import { Add } from "@mui/icons-material";
import styled from "styled-components";

import { Selection } from "@fiftyone/components";
import { filter } from "lodash";
import { atom, useRecoilState } from "recoil";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { viewDialogOpen } from ".";

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

const DialogBody = styled(Box)`
  flex-direction: column;
  width: 500px;
`;

interface Props {
  name?: string;
}

export default function ViewDialog(props: Props) {
  const [isOpen, setIsOpen] = useRecoilState<boolean>(viewDialogOpen);

  return (
    <Dialog open={isOpen} onClose={() => setIsOpen(false)}>
      <DialogBody>
        <DialogTitle>
          Subscribe
          <IconButton
            aria-label="close"
            onClick={() => setIsOpen(false)}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>asd</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={() => console.log("subscribe")}>Subscribe</Button>
        </DialogActions>
      </DialogBody>
    </Dialog>
  );
}
