import React, { useState } from "react";
import ButtonView from "@fiftyone/core/src/plugins/SchemaIO/components/ButtonView";
import { Box, Modal, Typography } from "@mui/material";
import DisplayTags from "./DisplayTags";
import { MuiIconFont } from "../index";

interface ModalBaseProps {
  modal: {
    icon?: string;
    iconVariant?: "outlined" | "filled" | "rounded" | "sharp" | undefined;
    title: string;
    subtitle: string;
    body: string;
    textAlign?: string | { [key: string]: string };
  };
  primaryButton: {
    align?: string;
    width?: string;
    primaryText: string;
    primaryColor: string;
  };
  secondaryButton: {
    align?: string;
    width?: string;
    secondaryText: string;
    secondaryColor: string;
  };
  callbackFunction: () => void;
  functionality: string;
  props: any;
}

interface ModalButtonView {
  variant: string;
  label: string;
  icon?: string;
  iconPosition?: string;
  componentsProps: any;
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

  const defaultAlign = "left";

  let titleAlign = defaultAlign;
  let subtitleAlign = defaultAlign;
  let bodyAlign = defaultAlign;

  if (typeof modal?.textAlign === "string") {
    titleAlign = subtitleAlign = bodyAlign = modal.textAlign;
  } else {
    titleAlign = modal?.textAlign?.title ?? defaultAlign;
    subtitleAlign = modal?.textAlign?.subtitle ?? defaultAlign;
    bodyAlign = modal?.textAlign?.body ?? defaultAlign;
  }

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

  const modalButtonView: ModalButtonView = {
    variant: props?.variant || "outlined",
    label: props?.label || "Open Modal",
    componentsProps: {
      button: {
        sx: {
          height: props?.height || "100%",
          width: props?.width || "100%",
          padding: 1,
        },
      },
    },
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
        sx: {
          width: primaryButton?.width || "100%",
          justifyContent: primaryButton?.align || "center",
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
          width: primaryButton?.width || "100%",
          justifyContent: primaryButton?.align || "center",
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
            sx={{ textAlign: titleAlign }}
          >
            {modal?.icon && (
              <MuiIconFont
                variant={modal?.iconVariant || "filled"}
                sx={{ verticalAlign: "middle" }}
                name={modal.icon}
              >
                {modal.icon}
              </MuiIconFont>
            )}{" "}
            {title}
          </Typography>
          <Typography
            id="modal-subtitle"
            variant="h6"
            component="h6"
            sx={{ mt: 4, textAlign: subtitleAlign }}
          >
            {subtitle}
          </Typography>
          <Typography id="modal-body" sx={{ my: 1, textAlign: bodyAlign }}>
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
