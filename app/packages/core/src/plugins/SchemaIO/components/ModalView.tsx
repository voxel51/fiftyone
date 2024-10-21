import React from "react";
import ModalBase from "@fiftyone/components/src/components/ModalBase/ModalBase";

export default function ModalView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const {
    modal,
    primaryButton,
    secondaryButton,
    functionality,
    primaryCallback,
    secondaryCallback,
    ...remainingViewProps
  } = view;

  return (
    <ModalBase
      modal={modal}
      primaryButton={primaryButton}
      secondaryButton={secondaryButton}
      functionality={functionality}
      primaryCallback={primaryCallback}
      secondaryCallback={secondaryCallback}
      props={{
        ...remainingViewProps,
      }}
    />
  );
}
