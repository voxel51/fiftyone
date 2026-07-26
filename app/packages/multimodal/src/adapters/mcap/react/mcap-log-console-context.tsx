import React, { createContext, useContext, useMemo } from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { McapResourceClient } from "../types";

export interface McapLogConsoleContextValue {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
}

const McapLogConsoleContext = createContext<McapLogConsoleContextValue | null>(
  null,
);

export const McapLogConsoleProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
}> = ({ children, client, source }) => {
  const value = useMemo(() => ({ client, source }), [client, source]);
  return (
    <McapLogConsoleContext.Provider value={value}>
      {children}
    </McapLogConsoleContext.Provider>
  );
};

export function useMcapLogConsoleContext(): McapLogConsoleContextValue {
  const value = useContext(McapLogConsoleContext);
  if (!value) {
    throw new Error(
      "useMcapLogConsoleContext must be used inside <McapLogConsoleProvider>",
    );
  }
  return value;
}
