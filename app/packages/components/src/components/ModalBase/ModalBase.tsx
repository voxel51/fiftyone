import React, { useState } from "react";
import ButtonView from "@fiftyone/core/src/plugins/SchemaIO/components/ButtonView";
import { Box, Modal, Typography } from "@mui/material";
import DisplayTags from "./DisplayTags";

interface ModalBaseProps {
  modal: {
    title: string;
    subtitle: string;
    body: string;
    textAlign?: string | { [key: string]: string };
  };
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
  const { title, subtitle, body, textAlign } = modal;
  const { primaryText, primaryColor } = primaryButton;
  const { secondaryText, secondaryColor } = secondaryButton;

  const modalStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 600,
    bgcolor: "background.paper",
    border: "2px solid #000",
    boxShadow: 24,
    p: 6, // Padding for inner spacing
    display: "flex", // Use flexbox to control alignment
    flexDirection: "column", // Stack items vertically
    justifyContent: "center", // Vertically center the content
  };

  console.log(props);
  const modalButtonView: ModalButtonView = {
    variant: props?.variant || "outlined",
    label: props?.label || "Open Modal",
    // TODO: figure out how to pass down layout based props to ButtonView
    // width: "500px",
    // height: "100px",
    // padding: 1,
  };

  if (Object.keys(props).includes("icon")) {
    modalButtonView["icon"] = props["icon"];
    modalButtonView["iconPosition"] = props?.iconPosition || "left";
  }

  const primaryButtonView = {
    variant: "contained",
    color: primaryColor,
    label: primaryText,
    componentsProps: {
      button: {
        // sx: {
        //     display: "flex",
        //     flexGrow: 1,
        //     flexDirection: "row",
        //     justifyContent: "center",
        // },
        sx: {
          width: "100%",
          justifyContent: "center",
        },
      },
    },
  };

  const secondaryButtonView = {
    variant: "outlined",
    color: secondaryColor,
    label: secondaryText,
    componentsProps: {
      button: {
        sx: {
          width: "100%",
          justifyContent: "center",
        },
      },
    },
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
  // TODO: figure out how to pass tags back up to callback
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
          <Typography
            id="modal-title"
            variant="h5"
            component="h5"
            sx={{ textAlign: "left" }}
          >
            {title}
          </Typography>
          <Typography
            id="modal-subtitle"
            variant="h6"
            component="h6"
            sx={{ mt: 4, textAlign: "left" }}
          >
            {subtitle}
          </Typography>
          <Typography id="modal-body" sx={{ my: 1, textAlign: "left" }}>
            {body}
          </Typography>
          {functionality === "tagging" && (
            <DisplayTags saveTags={handleSaveTags} />
          )}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mt: 2,
              gap: 3,
            }}
          >
            {primaryButton && (
              <Box sx={{ flexGrow: 1 }}>
                {/*TODO: Figure out how have button View fill remaining space*/}
                <ButtonView
                  onClick={handleClose}
                  schema={{
                    view: secondaryButtonView,
                  }}
                />
              </Box>
            )}
            {secondaryButton && (
              <Box sx={{ flexGrow: 1 }}>
                <ButtonView
                  onClick={sendTagsToCallback}
                  schema={{
                    view: primaryButtonView,
                  }}
                />
              </Box>
            )}
          </Box>
        </Box>
      </Modal>
    </>
  );
};
export default ModalBase;
