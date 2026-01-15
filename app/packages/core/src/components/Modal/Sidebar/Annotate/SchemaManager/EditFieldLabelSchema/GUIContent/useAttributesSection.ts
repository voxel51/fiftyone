/**
 * Hook for managing attributes section state and handlers.
 */

import { useCallback, useMemo, useState } from "react";
import {
  attributeConfigToFormState,
  createDefaultAttributeFormState,
  formStateToAttributeConfig,
  getAttributeNameError,
  type AttributeConfig,
  type AttributeFormState,
} from "../../utils";

interface UseAttributesSectionProps {
  attributes: Record<string, AttributeConfig>;
  onAddAttribute: (name: string, config: AttributeConfig) => void;
  onEditAttribute: (
    oldName: string,
    newName: string,
    config: AttributeConfig
  ) => void;
  onDeleteAttribute: (name: string) => void;
}

export default function useAttributesSection({
  attributes,
  onAddAttribute,
  onEditAttribute,
  onDeleteAttribute,
}: UseAttributesSectionProps) {
  // Add mode state
  const [isAdding, setIsAdding] = useState(false);
  const [addFormState, setAddFormState] = useState<AttributeFormState>(
    createDefaultAttributeFormState()
  );
  const [addIsDirty, setAddIsDirty] = useState(false);

  // Edit mode state
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null);
  const [editFormState, setEditFormState] = useState<AttributeFormState | null>(
    null
  );
  const [editIsDirty, setEditIsDirty] = useState(false);

  const existingAttributeNames = useMemo(
    () => Object.keys(attributes),
    [attributes]
  );

  // Add mode validation
  const addNameError = getAttributeNameError(
    addFormState.name,
    existingAttributeNames
  );
  const addShowError = addIsDirty && addNameError;
  const canAdd = !addNameError;

  // Edit mode validation
  const editNameError =
    editingAttribute && editFormState
      ? getAttributeNameError(
          editFormState.name,
          existingAttributeNames,
          editingAttribute
        )
      : null;
  const editShowError = editIsDirty && editNameError;
  const canEdit = !editNameError;

  // Add mode handlers
  const startAdd = useCallback(() => {
    setIsAdding(true);
    setAddFormState(createDefaultAttributeFormState());
    setAddIsDirty(false);
  }, []);

  const cancelAdd = useCallback(() => {
    setIsAdding(false);
    setAddFormState(createDefaultAttributeFormState());
    setAddIsDirty(false);
  }, []);

  const handleAddFormChange = useCallback((newState: AttributeFormState) => {
    setAddFormState(newState);
    setAddIsDirty(true);
  }, []);

  const saveAdd = useCallback(() => {
    if (!canAdd) return;
    onAddAttribute(
      addFormState.name.trim(),
      formStateToAttributeConfig(addFormState)
    );
    cancelAdd();
  }, [addFormState, canAdd, cancelAdd, onAddAttribute]);

  // Edit mode handlers
  const startEdit = useCallback(
    (name: string) => {
      const config = attributes[name];
      if (config) {
        setEditingAttribute(name);
        setEditFormState(attributeConfigToFormState(name, config));
        setEditIsDirty(false);
      }
    },
    [attributes]
  );

  const cancelEdit = useCallback(() => {
    setEditingAttribute(null);
    setEditFormState(null);
    setEditIsDirty(false);
  }, []);

  const handleEditFormChange = useCallback((newState: AttributeFormState) => {
    setEditFormState(newState);
    setEditIsDirty(true);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingAttribute || !editFormState || !canEdit) return;
    onEditAttribute(
      editingAttribute,
      editFormState.name.trim(),
      formStateToAttributeConfig(editFormState)
    );
    cancelEdit();
  }, [editingAttribute, editFormState, canEdit, cancelEdit, onEditAttribute]);

  const deleteEditing = useCallback(() => {
    if (editingAttribute) {
      onDeleteAttribute(editingAttribute);
      cancelEdit();
    }
  }, [editingAttribute, cancelEdit, onDeleteAttribute]);

  return {
    // Add mode
    isAdding,
    addFormState,
    addNameError: addShowError ? addNameError : null,
    canAdd,
    startAdd,
    cancelAdd,
    handleAddFormChange,
    saveAdd,

    // Edit mode
    editingAttribute,
    editFormState,
    editNameError: editShowError ? editNameError : null,
    canEdit,
    startEdit,
    cancelEdit,
    handleEditFormChange,
    saveEdit,
    deleteEditing,

    // Shared
    existingAttributeNames,
    isEditingOrAdding: isAdding || editingAttribute !== null,
  };
}
