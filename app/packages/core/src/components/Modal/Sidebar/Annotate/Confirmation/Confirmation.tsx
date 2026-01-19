import type { PropsWithChildren } from "react";
import { createContext, useCallback } from "react";
import useDelete from "../Edit/useDelete";
import useExit from "../Edit/useExit";
import useSave from "../Edit/useSave";
import { useConfirmDelete } from "./useConfirmDelete";
import useConfirmExit from "./useConfirmExit";
import {
  KnownCommands,
  KnownContexts,
  useCreateCommand,
  useKeyBinding,
} from "@fiftyone/commands";
import { useAtomValue } from "jotai";
import { current } from "../Edit/state";
export const ConfirmationContext = createContext({
  onExit: () => {},
});

export default function Confirmation({ children }: PropsWithChildren) {
  const onDelete = useDelete();
  const { confirmDelete, DeleteModal } = useConfirmDelete(onDelete);
  const { confirmExit, ExitChangesModal } = useConfirmExit(
    useExit(),
    useSave()
  );
  const label = useAtomValue(current);
  useCreateCommand(
    KnownContexts.Modal,
    KnownCommands.ModalDeleteAnnotation,
    () => {
      confirmDelete();
    },
    () => {
      return !!label;
    },
    "Delete",
    "Delete label"
  );

  useKeyBinding(
    KnownCommands.ModalDeleteAnnotation,
    "delete",
    KnownContexts.Modal
  );
  return (
    <ConfirmationContext.Provider
      value={{
        onExit: useCallback(() => confirmExit(() => null), [confirmExit]),
      }}
    >
      {children}
      <DeleteModal />
      <ExitChangesModal />
    </ConfirmationContext.Provider>
  );
}
