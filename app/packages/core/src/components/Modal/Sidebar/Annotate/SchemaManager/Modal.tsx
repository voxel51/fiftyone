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
  textColorClass,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ItemLeft } from "../Components";
import { TAB_JSON } from "./constants";
import EditFieldLabelSchema from "./EditFieldLabelSchema";
import GUIView from "./GUIView";
import {
  useCurrentField,
  useCurrentFieldValue,
  useNewFieldMode,
  useSchemaEditorGUIJSONToggle,
  useSchemaManagerCleanup,
  useSchemaManagerModal,
  useSelectedFieldCounts,
} from "./hooks";
import NewFieldSchema from "./NewFieldSchema";
import {
  useHideSelectedFields,
  useUnhideSelectedFields,
} from "./useVisibilityMoves";
import { useBackdropDismiss } from "./useBackdropDismiss";
import { useOpenOnCurrentSchema } from "./useSchemaDocs";
import {
  BackButton,
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
        <Text variant={TextVariant.Xl}>New field schema</Text>
      </ItemLeft>
    );
  }

  if (!field) {
    return (
      <div>
        <Text variant={TextVariant.Xl}>Schema manager</Text>
        <div style={{ marginTop: 4 }}>
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            Label schemas decide which fields annotators and explorers see.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <ItemLeft>
      <BackButton
        data-cy="schema-manager-back"
        color="secondary"
        onClick={() => setField(null)}
      />
      <Text variant={TextVariant.Xl}>Edit field schema</Text>
    </ItemLeft>
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
  const { tab } = useSchemaEditorGUIJSONToggle();
  const { activeCount: activeSelectedCount, hiddenCount: hiddenSelectedCount } =
    useSelectedFieldCounts();
  const unhideFields = useUnhideSelectedFields();
  const hideFields = useHideSelectedFields();

  // Don't show footer when editing a field (it has its own footer)
  if (field) {
    return null;
  }

  // Don't show footer when in JSON tab
  if (tab === TAB_JSON) {
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
  const onMove = isMovingToVisible ? unhideFields : hideFields;

  return (
    <ModalFooter>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center" }}
      >
        <Button
          data-cy="move-fields"
          size={Size.Md}
          variant={Variant.Secondary}
          onClick={onMove}
        >
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
          Move {selectedCount} to {isMovingToVisible ? "active" : "hidden"}{" "}
          fields
        </Button>
      </Stack>
    </ModalFooter>
  );
};

const Modal = () => {
  // Reset currentField on unmount.
  // Note: Selection state is reset by useSelectionCleanup in GUIContent,
  // and JSON editor state is reset by useFullSchemaEditor's cleanup effect.
  useSchemaManagerCleanup();

  // Open on the schema currently IN USE — the active workflow task's
  // schema, else the Explore lens — instead of always defaulting to
  // dataset mode. One-shot per open (cleanup nulls the selection on
  // close), so switching to "Dataset schema" afterwards sticks.
  useOpenOnCurrentSchema();

  const { closeSchemaManager } = useSchemaManagerModal();
  const backdropHandlers = useBackdropDismiss(closeSchemaManager);

  const element = useMemo(() => {
    const el = document.getElementById("annotation");
    if (!el) {
      throw new Error("no annotation modal element");
    }
    return el;
  }, []);

  useEffect(() => {
    element.style.display = "block";

    return () => {
      element.style.display = "none";
    };
  }, [element]);

  return createPortal(
    <ModalBackground {...backdropHandlers}>
      <ModalContainer
        data-cy="schema-manager"
        // React events bubble through the portal to the components that
        // render this modal; clicks inside it are not theirs
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader>
          <Heading />
          <Button
            variant={Variant.Icon}
            borderless
            size={Size.Sm}
            data-cy="close-schema-manager"
            onClick={() => closeSchemaManager()}
            style={{ marginRight: "14px" }}
          >
            <Icon
              name={IconName.Close}
              size={Size.Lg}
              className={textColorClass(TextColor.Secondary)}
            />
          </Button>
        </ModalHeader>

        <Page />

        <SchemaManagerFooter />
      </ModalContainer>
    </ModalBackground>,
    element,
  );
};

export default Modal;
