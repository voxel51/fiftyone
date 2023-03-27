import React from "react";
import { IEnvironment } from "relay-runtime";

export const RelayEnvironmentContext =
  React.createContext<IEnvironment>(undefined);

export const useRelayEnvironment = () => {
  return React.useContext(RelayEnvironmentContext);
};

export default RelayEnvironmentContext;
