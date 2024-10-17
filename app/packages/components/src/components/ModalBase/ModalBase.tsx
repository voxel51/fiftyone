import React, { useState } from "react";
import ButtonView from "@fiftyone/core/src/plugins/SchemaIO/components/ButtonView";
import { Box } from "@mui/material";

interface ModalBaseProps {
  modal: { title: string; subtitle: string; body: string };
  primaryButton: { primaryText: string; primaryColor: string };
  secondaryButton: { secondaryText: string; secondaryColor: string };
  callbackFunction: () => void;
  props: any;
}

const ModalBase: React.FC<ModalBaseProps> = ({
  modal,
  primaryButton,
  secondaryButton,
  callbackFunction,
  props,
}) => {
  const { title, subtitle, body } = modal;
  const { primaryText, primaryColor } = primaryButton;
  const { secondaryText, secondaryColor } = secondaryButton;

  const modalButtonView = {
    variant: "contained",
    icon: "add",
    iconPosition: "left",
    label: "cta_button_label",
  };

  const primaryButtonView = {
    variant: "contained",
    color: primaryColor,
    label: primaryText,
  };

  const openModal = () => {};

  return (
    <Box>
      <ButtonView
        onClick={openModal}
        schema={{
          view: modalButtonView,
        }}
      />
    </Box>
  );
};
export default ModalBase;
