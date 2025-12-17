import { MuiButton } from "@fiftyone/components";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ItemLeft } from "../Components";
import { activeSchemaTab, showModal } from "../state";
import FieldsTabs from "./FieldsTabs";
import GUIView, {
  selectedActiveFields,
  selectedHiddenFields,
  useActivateFields,
  useDeactivateFields,
} from "./GUIView";
import JSONView from "./JSONView";
import LabelSchemaEditor from "./LabelSchemaEditor";
import { currentField } from "./state";
import {
  BackButton,
  CloseButton,
  FooterLeft,
  FooterRight,
  ModalBackground,
  ModalContainer,
  ModalFooter,
  ModalHeader,
} from "./styled";

// Re-export for backwards compatibility
export { ModalHeader as Header } from "./styled";

const Heading = () => {
  const [field, setField] = useAtom(currentField);

  if (!field) {
    return <Typography variant="h5">Schema manager</Typography>;
  }

  return (
    <ItemLeft>
      <BackButton color="secondary" onClick={() => setField(null)} />
      <Typography variant="h5">Edit field schema</Typography>
    </ItemLeft>
  );
};

const Subheading = () => {
  const field = useAtomValue(currentField);

  if (field) {
    return null;
  }

  return (
    <>
      <Typography color="secondary" padding="1rem 0">
        Manage your annotation schemas
      </Typography>
      <ModalHeader style={{ margin: "1rem 0" }}>
        <FieldsTabs />
        <MuiButton variant="contained">New field</MuiButton>
      </ModalHeader>
    </>
  );
};

const Page = () => {
  const field = useAtomValue(currentField);
  const tab = useAtomValue(activeSchemaTab);

  if (field) {
    return <LabelSchemaEditor field={field} />;
  }

  if (tab === "gui") {
    return <GUIView />;
  }

  return <JSONView />;
};

const SchemaManagerFooter = () => {
  const field = useAtomValue(currentField);
  const tab = useAtomValue(activeSchemaTab);
  const activeSelectedCount = useAtomValue(selectedActiveFields).size;
  const hiddenSelectedCount = useAtomValue(selectedHiddenFields).size;
  const activateFields = useActivateFields();
  const deactivateFields = useDeactivateFields();

  // Don't show footer when editing a field (it has its own footer)
  if (field) {
    return null;
  }

  const isGUIView = tab === "gui";

  const hasSelection = hiddenSelectedCount > 0 || activeSelectedCount > 0;
  const isMovingToVisible = hiddenSelectedCount > 0;
  const selectedCount = isMovingToVisible
    ? hiddenSelectedCount
    : activeSelectedCount;
  const onMove = isMovingToVisible ? activateFields : deactivateFields;

  return (
    <ModalFooter>
      <FooterLeft>
        {isGUIView && hasSelection && (
          <MuiButton
            variant="outlined"
            startIcon={
              isMovingToVisible ? <KeyboardArrowUp /> : <KeyboardArrowDown />
            }
            onClick={onMove}
          >
            Move {selectedCount} to {isMovingToVisible ? "visible" : "hidden"}{" "}
            fields
          </MuiButton>
        )}
      </FooterLeft>
      <FooterRight>
        <MuiButton variant="outlined" disabled>
          Discard
        </MuiButton>
        <MuiButton variant="contained" disabled>
          Save
        </MuiButton>
      </FooterRight>
    </ModalFooter>
  );
};

const Modal = () => {
  const element = useMemo(() => {
    const el = document.getElementById("annotation");
    if (!el) {
      throw new Error("no annotation modal element");
    }
    return el;
  }, []);
  const show = useSetAtom(showModal);

  useEffect(() => {
    element.style.display = "block";

    return () => {
      element.style.display = "none";
    };
  }, [element]);

  return createPortal(
    <ModalBackground onClick={() => show(false)}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <Heading />
          <CloseButton color="secondary" onClick={() => show(false)} />
        </ModalHeader>

        <Subheading />

        <Page />

        <SchemaManagerFooter />
      </ModalContainer>
    </ModalBackground>,
    element
  );
};

export default Modal;
