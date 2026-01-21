import type { PropsWithChildren } from "react";
import { createContext, useCallback } from "react";
import useDelete from "../Edit/useDelete";
import useExit from "../Edit/useExit";
import useSave from "../Edit/useSave";
import { useConfirmDelete } from "./useConfirmDelete";
import useConfirmExit from "./useConfirmExit";
export const ConfirmationContext = createContext({
  onExit: () => {},
});

export default function Confirmation({ children }: PropsWithChildren) {
  const onDelete = useDelete();
  const { DeleteModal } = useConfirmDelete(onDelete);
  const { confirmExit, ExitChangesModal } = useConfirmExit(
    useExit(),
    useSave()
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
