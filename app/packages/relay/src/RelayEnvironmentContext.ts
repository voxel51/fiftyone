import React from "react";
import { IEnvironment } from "relay-runtime";

export const RelayEnvironmentContext = React.createContext<
  IEnvironment | undefined
>(undefined);

export const useRelayEnvironment = () => {
  return React.useContext(RelayEnvironmentContext) as IEnvironment;
};

export default RelayEnvironmentContext;
