import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import type { LabelRef } from "../engine";

/**
 * Status code when attempting to initialize annotation schema.
 */
export enum InitializationStatus {
  InsufficientPermissions,
  ServerError,
  Success,
}

/**
 * Result type when attempting to enter annotation context.
 */
export type EnterResult = {
  status: InitializationStatus;
  message?: string;
};

/**
 * Manager which provides methods for stateful entry-into and exit-from
 * annotation mode.
 *
 * The implementation lives in the app layer (it composes schema management,
 * modal state, and edit-mode teardown); it registers itself here via
 * {@link useRegisterAnnotationContextManager} so package-level consumers
 * ({@link useAnnotationController}) can reach it without a dependency on the
 * app layer.
 */
export interface AnnotationContextManager {
  /**
   * Initialize and activate a field's annotation schema within an
   * already-active annotation context.
   *
   * Use this when the annotation context is already entered (e.g. the
   * Annotate tab is mounted) and you need to activate a specific field.
   *
   * @param field The field name to initialize and activate
   */
  activateField: (field: string) => Promise<EnterResult>;

  /**
   * Enter annotation mode, performing any required setup for the specified `path`.
   *
   * If a {@link FieldSchema} does not exist for the specified `path`,
   * one will be created automatically.
   *
   * The modal's active paths will be updated to only include the specified `path`.
   *
   * If a `labelId` is provided,
   * that label instance will be opened for editing in the annotation sidebar.
   *
   * @param path The path to the sample field
   * @param labelId The ID of the active label
   */
  enter: (path?: string, labelId?: string) => Promise<EnterResult>;

  /**
   * Exit annotation mode, restoring the previous state in explore mode.
   *
   * Any active paths which were set before calling {@link enter} will be restored.
   */
  exit: () => void;
}

const registeredManagerAtom = atom<AnnotationContextManager | null>(null);

/**
 * Binding agent for the app layer's {@link AnnotationContextManager}
 * implementation. Mount once at an always-mounted root (it must precede the
 * modal so programmatic entry — e.g. the `annotate` operator — works before
 * the modal opens).
 */
export const useRegisterAnnotationContextManager = (
  manager: AnnotationContextManager
): void => {
  const setManager = useSetAtom(registeredManagerAtom);

  useEffect(() => {
    setManager(manager);

    return () => setManager(null);
  }, [manager, setManager]);
};

/**
 * The registered {@link AnnotationContextManager}, or `null` before the app
 * layer has registered one.
 */
export const useRegisteredAnnotationContextManager =
  (): AnnotationContextManager | null => useAtomValue(registeredManagerAtom);

/**
 * The entrance label: which label should open for editing on annotate entry.
 * A complete engine ref, captured at the dispatch site — consumers apply it
 * verbatim, never resolving identity from ambient state.
 */
const entranceLabelAtom = atom<LabelRef | null>(null);

export const useEntranceLabel = (): LabelRef | null =>
  useAtomValue(entranceLabelAtom);

/**
 * Hook that returns a setter for the entrance label.
 *
 * Use this to request that a label open for editing on annotate entry. The
 * payload carries the field path captured at the dispatch site; consumers
 * ({@link useRegisterRendererEventHandlers}) apply it to the engine anchor
 * once the engine knows the label.
 */
export const useSetEntranceLabel = () => useSetAtom(entranceLabelAtom);

export const useClearEntranceLabel = (): (() => void) => {
  const setEntranceLabel = useSetAtom(entranceLabelAtom);

  return useCallback(() => setEntranceLabel(null), [setEntranceLabel]);
};
