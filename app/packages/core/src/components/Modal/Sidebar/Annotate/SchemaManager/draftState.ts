import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  activeLabelSchemas,
  activePaths,
  inactiveLabelSchemas,
  inactivePaths,
} from "../state";
import { showModal } from "../state";

export const draftActiveFields = atom<string[] | null>(null);
export const draftHiddenFields = atom<string[] | null>(null);

export const hasDraftChanges = atom((get) => {
  return get(draftActiveFields) !== null || get(draftHiddenFields) !== null;
});

export const useInitializeDraft = () => {
  const activeFromNew = useAtomValue(activePaths);
  const activeFromLegacy = useAtomValue(activeLabelSchemas);
  const hiddenFromNew = useAtomValue(inactivePaths);
  const hiddenFromLegacy = useAtomValue(inactiveLabelSchemas);

  const setDraftActive = useSetAtom(draftActiveFields);
  const setDraftHidden = useSetAtom(draftHiddenFields);

  useEffect(() => {
    setDraftActive(null);
    setDraftHidden(null);
  }, [setDraftActive, setDraftHidden]);

  const currentActive = activeFromNew?.length
    ? activeFromNew
    : activeFromLegacy ?? [];
  const currentHidden = hiddenFromNew?.length
    ? hiddenFromNew
    : hiddenFromLegacy ?? [];

  return { currentActive, currentHidden };
};

export const effectiveActiveFields = atom((get) => {
  const draft = get(draftActiveFields);
  if (draft !== null) return draft;

  const fromNew = get(activePaths);
  const fromLegacy = get(activeLabelSchemas);
  return fromNew?.length ? fromNew : fromLegacy ?? [];
});

export const effectiveHiddenFields = atom((get) => {
  const draft = get(draftHiddenFields);
  if (draft !== null) return draft;

  const fromNew = get(inactivePaths);
  const fromLegacy = get(inactiveLabelSchemas);
  return fromNew?.length ? fromNew : fromLegacy ?? [];
});

export const useUpdateDraftOrder = () => {
  const setDraftActive = useSetAtom(draftActiveFields);

  return useCallback(
    (newOrder: string[]) => {
      setDraftActive(newOrder);
    },
    [setDraftActive]
  );
};

export const useDraftActivateFields = () => {
  const currentActive = useAtomValue(effectiveActiveFields);
  const currentHidden = useAtomValue(effectiveHiddenFields);
  const setDraftActive = useSetAtom(draftActiveFields);
  const setDraftHidden = useSetAtom(draftHiddenFields);

  return useCallback(
    (fieldsToActivate: Set<string>) => {
      const newActive = [...currentActive, ...Array.from(fieldsToActivate)];
      const newHidden = currentHidden.filter((f) => !fieldsToActivate.has(f));
      setDraftActive(newActive);
      setDraftHidden(newHidden);
    },
    [currentActive, currentHidden, setDraftActive, setDraftHidden]
  );
};

export const useDraftDeactivateFields = () => {
  const currentActive = useAtomValue(effectiveActiveFields);
  const currentHidden = useAtomValue(effectiveHiddenFields);
  const setDraftActive = useSetAtom(draftActiveFields);
  const setDraftHidden = useSetAtom(draftHiddenFields);

  return useCallback(
    (fieldsToDeactivate: Set<string>) => {
      const newActive = currentActive.filter((f) => !fieldsToDeactivate.has(f));
      const newHidden = [...currentHidden, ...Array.from(fieldsToDeactivate)];
      setDraftActive(newActive);
      setDraftHidden(newHidden);
    },
    [currentActive, currentHidden, setDraftActive, setDraftHidden]
  );
};

export const useSaveChanges = () => {
  const draftActive = useAtomValue(draftActiveFields);
  const draftHidden = useAtomValue(draftHiddenFields);
  const setDraftActive = useSetAtom(draftActiveFields);
  const setDraftHidden = useSetAtom(draftHiddenFields);

  const setActivePaths = useSetAtom(activePaths);
  const setActiveLegacy = useSetAtom(activeLabelSchemas);
  const setHiddenPaths = useSetAtom(inactivePaths);
  const setHiddenLegacy = useSetAtom(inactiveLabelSchemas);

  const setActiveSchemas = useOperatorExecutor("set_active_label_schemas");
  const setMessage = useNotification();
  const setShowModal = useSetAtom(showModal);

  return useCallback(() => {
    if (draftActive !== null) {
      setActivePaths(draftActive);
      setActiveLegacy(draftActive);
      setActiveSchemas.execute({ fields: draftActive });
    }

    if (draftHidden !== null) {
      setHiddenPaths(draftHidden);
      setHiddenLegacy(draftHidden);
    }

    setDraftActive(null);
    setDraftHidden(null);

    setMessage({
      msg: "Schema changes saved",
      variant: "success",
    });

    setShowModal(false);
  }, [
    draftActive,
    draftHidden,
    setActivePaths,
    setActiveLegacy,
    setHiddenPaths,
    setHiddenLegacy,
    setActiveSchemas,
    setDraftActive,
    setDraftHidden,
    setMessage,
    setShowModal,
  ]);
};

export const useDiscardChanges = () => {
  const setDraftActive = useSetAtom(draftActiveFields);
  const setDraftHidden = useSetAtom(draftHiddenFields);
  const setShowModal = useSetAtom(showModal);

  return useCallback(() => {
    setDraftActive(null);
    setDraftHidden(null);
    setShowModal(false);
  }, [setDraftActive, setDraftHidden, setShowModal]);
};
