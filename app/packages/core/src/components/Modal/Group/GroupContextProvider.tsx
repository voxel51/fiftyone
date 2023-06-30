import { AbstractLooker } from "@fiftyone/looker";
import React, { useContext } from "react";

export type GroupContext = {
  lookerRefCallback: (looker: AbstractLooker) => void;
};

const defaultOptions: GroupContext = {
  lookerRefCallback: () => {},
};

export const groupContext = React.createContext<GroupContext>(defaultOptions);

export const useGroupContext = () => useContext(groupContext);

interface GroupContextProviderProps {
  children: React.ReactNode;
  lookerRefCallback: (looker: AbstractLooker) => void;
}

export const GroupContextProvider = ({
  lookerRefCallback,
  children,
}: GroupContextProviderProps) => {
  return (
    <groupContext.Provider
      value={{
        lookerRefCallback,
      }}
    >
      {children}
    </groupContext.Provider>
  );
};
