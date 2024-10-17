import { getComponentProps } from "../utils";
import ModalBase from "@fiftyone/components/src/components/ModalBase/ModalBase";

export default function ModalView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { modal, primaryButton, secondaryButton, callbackFunction } = view;

  return (
    <ModalBase
      modal={modal}
      primaryButton={primaryButton}
      secondaryButton={secondaryButton}
      callbackFunction={callbackFunction}
      props={getComponentProps(props, "modalBase")}
    />
  );
}
