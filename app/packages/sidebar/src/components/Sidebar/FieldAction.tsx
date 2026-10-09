/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createContext, useContext, type FC, type ReactNode } from "react";

export type FieldActionProps = {
  children?: ReactNode;
  enabled: boolean;
  path: string;
};

const Passthrough: FC<FieldActionProps> = ({ children }) => <>{children}</>;

/**
 * What a field entry offers beside its name, such as editing the field. The
 * App provides it; the sidebar only places it.
 */
export const FieldActionContext =
  createContext<FC<FieldActionProps>>(Passthrough);

export const FieldAction: FC<FieldActionProps> = (props) => {
  const Action = useContext(FieldActionContext);
  return <Action {...props} />;
};
