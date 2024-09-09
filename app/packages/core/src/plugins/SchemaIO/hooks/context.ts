import { createContext } from "react";

export const SchemaIOContext = createContext<SchemaIOContextType>({});

type SchemaIOContextType = {
  id?: string;
};
