import React, { useCallback, useEffect, useState } from "react";
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
  primaryButton?: {
    href?: any;
    prompt?: any;
    params?: any;
    operator?: any;
    align?: string;
    width?: string;
    onClick?: any;
    disabled?: boolean;
    primaryText: string;
    primaryColor: string;
  };
  secondaryButton?: {
    href?: any;
    prompt?: any;
    params?: any;
    operator?: any;
    align?: string;
    width?: string;
    onClick?: any;
    disabled?: boolean;
    secondaryText: string;
    secondaryColor: string;
  };
  functionality?: string;
  primaryCallback?: () => void;
  secondaryCallback?: () => void;
  props: any;
}

interface ModalButtonView {
  disabled?: boolean;
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
  primaryCallback,
  secondaryCallback,
  functionality = "none",
  props,
}) => {
  const { title, subtitle, body } = modal;

  const defaultAlign = "left";

  let titleAlign = defaultAlign;
  let subtitleAlign = defaultAlign;
  let bodyAlign = defaultAlign;

  const [open, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setTimeout(() => {
      setOpen(false);
    }, 500); // 500 milliseconds = 0.5 second
  };

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
    display: "flex",
    flexDirection: "column", // Stack items vertically
    justifyContent: "center", // Vertically center the content
  };

  const modalButtonView: ModalButtonView = {
    variant: props?.variant || "outlined",
    label: props?.label || "",
    disabled: props?.disabled,
    componentsProps: {
      button: {
        sx: {
          height: props?.height || "100%",
          width: props?.width || "100%",
          padding: props?.padding || 1,
          minWidth: 0,
        },
      },
    },
  };

  if (Object.keys(props).includes("icon")) {
    modalButtonView["icon"] = props["icon"];
    modalButtonView["iconPosition"] = props?.iconPosition || "left";
  }

  const [primaryButtonView, setPrimaryButtonView] = useState({
    variant: "contained",
    color: primaryButton?.primaryColor,
    label: primaryButton?.primaryText,
    onClick: primaryButton?.onClick,
    operator: primaryCallback || primaryButton?.operator,
    params: primaryButton?.params,
    href: primaryButton?.href,
    prompt: primaryButton?.prompt,
    disabled: primaryButton?.disabled,
    componentsProps: {
      button: {
        sx: {
          width: primaryButton?.width || "100%",
          justifyContent: primaryButton?.align || "center",
          ...primaryButton,
        },
      },
    },
  });

  const [secondaryButtonView, setSecondaryButtonView] = useState({
    variant: "outlined",
    color: secondaryButton?.secondaryColor,
    label: secondaryButton?.secondaryText,
    onClick: secondaryButton?.onClick,
    operator: secondaryCallback || secondaryButton?.operator,
    params: secondaryButton?.params,
    href: secondaryButton?.href,
    prompt: secondaryButton?.prompt,
    disabled: secondaryButton?.disabled,
    componentsProps: {
      button: {
        sx: {
          width: primaryButton?.width || "100%",
          justifyContent: primaryButton?.align || "center",
          ...secondaryButton,
        },
      },
    },
  });

  // State options for functionality based on user input

  {
    /* TAGGING FUNCTIONALITY */
  }
  useEffect(() => {
    if (
      (functionality === "tagging" || functionality === "Tagging") &&
      (!primaryButtonView.params ||
        !primaryButtonView.params.tags ||
        primaryButtonView.params.tags.length === 0)
    ) {
      setPrimaryButtonView({
        ...primaryButtonView,
        disabled: true,
      });
    } else {
      setPrimaryButtonView({
        ...primaryButtonView,
        disabled: false,
      });
    }
  }, [primaryButtonView.params]);

  const handleSaveTags = useCallback((tags: string[]) => {
    setPrimaryButtonView((prevButtonView) => ({
      ...prevButtonView,
      params: { ...prevButtonView.params, tags }, // Add tags to existing params
    }));
  }, []);

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
        onClose={() => setOpen(false)}
        aria-labelledby="modal-title"
        aria-describedby="modal-subtitle"
        sx={{ zIndex: 999 }}
      >
        <Box sx={modalStyle}>
          <Typography
            id="modal-title"
            variant="h5"
            component="h5"
            color="text.primary"
            sx={{
              textAlign: titleAlign,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            {modal?.icon && (
              <MuiIconFont
                variant={modal?.iconVariant || "filled"}
                sx={{ verticalAlign: "middle" }}
                name={modal.icon}
              >
                {modal.icon}
              </MuiIconFont>
            )}
            {title}
          </Typography>
          <Typography
            id="modal-subtitle"
            variant="h6"
            component="h6"
            color="text.primary"
            sx={{ mt: 4, textAlign: subtitleAlign }}
          >
            {subtitle}
          </Typography>
          <Typography
            id="modal-body"
            sx={{ my: 1, textAlign: bodyAlign }}
            color="text.primary"
          >
            {body}
          </Typography>
          {(functionality === "tagging" || functionality === "Tagging") && (
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
            {secondaryButton && (
              <Box sx={{ flexGrow: 1 }}>
                <ButtonView
                  onClick={handleClose}
                  schema={{
                    view: secondaryButtonView,
                  }}
                />
              </Box>
            )}
            {primaryButton && (
              <Box sx={{ flexGrow: 1 }}>
                <ButtonView
                  onClick={handleClose}
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
