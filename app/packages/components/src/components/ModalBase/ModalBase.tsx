import React, { useState } from "react";
import ButtonView from "@fiftyone/core/src/plugins/SchemaIO/components/ButtonView";
import { Box, Modal, Typography } from "@mui/material";
import DisplayTags from "./DisplayTags";

interface ModalBaseProps {
  modal: { title: string; subtitle: string; body: string };
  primaryButton: { primaryText: string; primaryColor: string };
  secondaryButton: { secondaryText: string; secondaryColor: string };
  callbackFunction: () => void;
  functionality: string;
  props: any;
}

interface ModalButtonView {
  variant: string;
  label: string;
  icon?: string;
  iconPosition?: string;
}

const ModalBase: React.FC<ModalBaseProps> = ({
  modal,
  primaryButton,
  secondaryButton,
  callbackFunction,
  functionality = "none",
  props,
}) => {
  const { title, subtitle, body } = modal;
  const { primaryText, primaryColor } = primaryButton;
  const { secondaryText, secondaryColor } = secondaryButton;

  const modalStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 400,
    bgcolor: "background.paper",
    border: "2px solid #000",
    boxShadow: 24,
    p: 4,
  };

  const modalButtonView: ModalButtonView = {
    variant: props?.variant || "outlined",
    label: props?.label || "Open Modal",
  };

  if (Object.keys(props).includes("icon")) {
    modalButtonView["icon"] = props["icon"];
    modalButtonView["iconPosition"] = props?.iconPosition || "left";
  }

  const primaryButtonView = {
    variant: "contained",
    color: primaryColor,
    label: primaryText,
  };

  const secondaryButtonView = {
    variant: "outlined",
    color: secondaryColor,
    label: secondaryText,
  };

  const [open, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
  };

  // State options for functionality based on user input

  const [savedTags, setSavedTags] = useState<string[]>([]);
  const handleSaveTags = (tags: string[]) => {
    setSavedTags(tags);
  };
  const sendTagsToCallback = () => {
    // callbackFunction(savedTags);
  };

  return (
    <>
      <Box>
        <ButtonView
          onClick={handleOpen}
          schema={{
            view: modalButtonView,
          }}
        />
      </Box>
      <Modal
        open={open}
        onClose={handleClose}
        aria-labelledby="modal-title"
        aria-describedby="modal-subtitle"
      >
        <Box sx={modalStyle}>
          <Typography id="modal-title" component="h3">
            {title}
          </Typography>
          <Typography id="modal-subtitle" sx={{ fontWeight: 500, mt: 2 }}>
            {subtitle}
          </Typography>
          <Typography id="modal-body">{body}</Typography>
          {functionality === "tagging" && (
            <DisplayTags saveTags={handleSaveTags} />
          )}
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <ButtonView
              onClick={handleClose}
              schema={{
                view: secondaryButtonView,
              }}
            />
            <ButtonView
              onClick={sendTagsToCallback}
              schema={{
                view: primaryButtonView,
              }}
            />
          </Box>
        </Box>
      </Modal>
    </>
  );
};
export default ModalBase;
