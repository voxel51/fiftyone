import {
  Button,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ItemLeft } from "../Components";
import EditFieldLabelSchema from "./EditFieldLabelSchema";
import GUIView, { useActivateFields, useDeactivateFields }  from "./GUIView";
import {
  useActivateFields,
  useCurrentField,
  useCurrentFieldValue,
  useDeactivateFields,
  useNewFieldMode,
  useSelectedFieldCounts,
  useShowSchemaManagerModal,
} from "./hooks";
import NewFieldSchema from "./NewFieldSchema";
import {
  BackButton,
  CloseButton,
  ModalBackground,
  ModalContainer,
  ModalFooter,
  ModalHeader,
} from "./styled";

// Re-export for backwards compatibility
export { ModalHeader as Header } from "./styled";

const Heading = () => {
  const { field, setField } = useCurrentField();
  const { isNewField: newFieldMode, setIsNewField: setNewFieldMode } =
    useNewFieldMode();

  if (newFieldMode) {
    return (
      <ItemLeft>
        <BackButton color="secondary" onClick={() => setNewFieldMode(false)} />
        <Text variant={TextVariant.XlBold}>New field schema</Text>
      </ItemLeft>
    );
  }

  if (!field) {
    return <Text variant={TextVariant.XlBold}>Schema manager</Text>;
  }

  return (
    <ItemLeft>
      <BackButton color="secondary" onClick={() => setField(null)} />
      <Text variant={TextVariant.XlBold}>Edit field schema</Text>
    </ItemLeft>
  );
};

const Subheading = () => {
  const field = useCurrentFieldValue();
  const { isNewField: newFieldMode } = useNewFieldMode();

  if (field || newFieldMode) {
    return null;
  }

  return (
    <Text color={TextColor.Secondary} style={{ padding: "1rem 0" }}>
      Manage your label schemas
    </Text>
  );
};

const Page = () => {
  const field = useCurrentFieldValue();
  const { isNewField: newFieldMode } = useNewFieldMode();

  if (newFieldMode) {
    return <NewFieldSchema />;
  }

  if (field) {
    return <EditFieldLabelSchema field={field} />;
  }

  return <GUIView />;
};

const SchemaManagerFooter = () => {
  const field = useCurrentFieldValue();
  const { activeCount: activeSelectedCount, hiddenCount: hiddenSelectedCount } =
    useSelectedFieldCounts();
  const activateFields = useActivateFields();
  const deactivateFields = useDeactivateFields();

  // Don't show footer when editing a field (it has its own footer)
  if (field) {
    return null;
  }

  const hasSelection = hiddenSelectedCount > 0 || activeSelectedCount > 0;

  // Only show footer when there's a selection to move
  if (!hasSelection) {
    return null;
  }

  const isMovingToVisible = hiddenSelectedCount > 0;
  const selectedCount = isMovingToVisible
    ? hiddenSelectedCount
    : activeSelectedCount;
  const onMove = isMovingToVisible ? activateFields : deactivateFields;

  return (
    <ModalFooter>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center" }}
      >
        <Button size={Size.Md} variant={Variant.Secondary} onClick={onMove}>
          {isMovingToVisible ? (
            <Icon
              name={IconName.ChevronTop}
              size={Size.Md}
              style={{ marginRight: 4 }}
            />
          ) : (
            <Icon
              name={IconName.ChevronBottom}
              size={Size.Md}
              style={{ marginRight: 4 }}
            />
          )}
          Move {selectedCount} to {isMovingToVisible ? "visible" : "hidden"}{" "}
          fields
        </Button>
      </Stack>
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
  const setShowModal = useShowSchemaManagerModal();

  useEffect(() => {
    element.style.display = "block";

    return () => {
      element.style.display = "none";
    };
  }, [element]);

  return createPortal(
    <ModalBackground onClick={() => setShowModal(false)}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <Heading />
          <CloseButton color="secondary" onClick={() => setShowModal(false)} />
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
