import type { PropsWithChildren } from "react";
import React, { createContext, useCallback } from "react";
import useDelete from "../Edit/useDelete";
import useExit from "../Edit/useExit";
import useSave from "../Edit/useSave";
import { useConfirmDelete } from "./useConfirmDelete";
import useConfirmExit from "./useConfirmExit";

export const ConfirmationContext = createContext({
  onDelete: () => {},
  onExit: () => {},
});

export default function Confirmation({ children }: PropsWithChildren<{}>) {
  const exit = useExit(false);
  const runDelete = useDelete();
  const fullDelete = useCallback(() => {
    runDelete();
    exit();
  }, [runDelete, exit]);

  const { confirmDelete, DeleteModal } = useConfirmDelete(fullDelete);
  const { confirmExit, ExitChangesModal } = useConfirmExit(
    useExit(),
    useSave()
  );

  return (
    <ConfirmationContext.Provider
      value={{
        onDelete: confirmDelete,
        onExit: useCallback(() => confirmExit(() => null), [confirmExit]),
      }}
    >
      {children}
      <DeleteModal />
      <ExitChangesModal />
    </ConfirmationContext.Provider>
  );
}
