import React, { createContext, useContext } from "react";

interface Fo3dContextT {}

interface Fo3dSceneProviderProps {
  children: React.ReactNode;
}

const defaultContext: Fo3dContextT = {};

const Fo3dSceneContext = createContext<Fo3dContextT>(defaultContext);

export const Fo3dSceneProvider = ({ children }: Fo3dSceneProviderProps) => {
  return (
    <Fo3dSceneContext.Provider value={defaultContext}>
      {children}
    </Fo3dSceneContext.Provider>
  );
};

export const useFo3d = () => {
  const {} = useContext(Fo3dSceneContext);

  return {};
};
