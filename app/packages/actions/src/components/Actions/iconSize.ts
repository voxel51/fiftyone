import { createContext, useContext } from "react";

/** Overrides the size of action icons, for rows that render them smaller */
export const ActionIconSizeContext = createContext<number | undefined>(
  undefined,
);

export const useActionIconSize = (size: number) =>
  useContext(ActionIconSizeContext) ?? size;
