import { useKeydownHandler } from "@fiftyone/state";
import type { PropsWithChildren } from "react";
import { createContext, useCallback } from "react";
import useDelete from "../Edit/useDelete";
import useExit from "../Edit/useExit";
import useSave from "../Edit/useSave";
import { useConfirmDelete } from "./useConfirmDelete";
import useConfirmExit from "./useConfirmExit";

export const ConfirmationContext = createContext({
  onDelete: () => { },
  onExit: () => { },
});

export default function Confirmation({ children }: PropsWithChildren) {
  const onDelete = useDelete();
  const { confirmDelete, DeleteModal } = useConfirmDelete(onDelete);
  const { confirmExit, ExitChangesModal } = useConfirmExit(
    useExit(),
    useSave()
  );

  useKeydownHandler((e) => {
    if (e.key === "Delete") {
      confirmDelete();
    }
  });

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
