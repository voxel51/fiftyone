import type { PropsWithChildren } from "react";
import React, { createContext } from "react";
import { useConfirmDelete } from "./useConfirmDelete";
import useConfirmExit from "./useConfirmExit";

export const ConfirmationContext = createContext({
  onDelete: () => {},
  onExit: () => {},
});

export default function Confirmation({
  children,
  onDelete,
  onExit,
  onSave,
}: PropsWithChildren<{
  onDelete: () => void;
  onExit: () => void;
  onSave: () => void;
}>) {
  const { confirmDelete, DeleteModal } = useConfirmDelete(onDelete);
  const { confirmExit, ExitChangesModal } = useConfirmExit(onExit, onSave);

  return (
    <ConfirmationContext.Provider
      value={{ onDelete: confirmDelete, onExit: confirmExit }}
    >
      {children}
      <DeleteModal />
      <ExitChangesModal />
    </ConfirmationContext.Provider>
  );
}
