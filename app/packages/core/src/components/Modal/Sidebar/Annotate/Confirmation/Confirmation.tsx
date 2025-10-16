import type { PropsWithChildren } from "react";
import React, { createContext } from "react";
import { useConfirmDelete } from "./useConfirmDelete";
import useConfirmExit from "./useConfirmExit";

export const ConfirmationContext = createContext({
  exit: () => {},
  deleteAnnotation: () => {},
});

export default function Confirmation({
  children,
  exit,
  saveAnnotation,
  deleteAnnotation,
}: PropsWithChildren<{
  exit: () => void;
  saveAnnotation: () => void;
  deleteAnnotation: () => void;
}>) {
  const { confirmDelete, DeleteModal } = useConfirmDelete(deleteAnnotation);
  const { confirmExit, ExitChangesModal } = useConfirmExit(
    exit,
    saveAnnotation
  );

  return (
    <ConfirmationContext.Provider
      value={{ deleteAnnotation: confirmDelete, exit: confirmExit }}
    >
      {children}
      <DeleteModal />
      <ExitChangesModal />
    </ConfirmationContext.Provider>
  );
}
