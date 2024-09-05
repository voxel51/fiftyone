import { createContext, useContext } from "react";

export type GlobalTimelineContext = {};

export const globalTimelineContext = createContext<
  GlobalTimelineContext | undefined
>(undefined);

export const useGlobalTimelineContext = () => {
  const context = useContext(globalTimelineContext);

  if (!context) {
    throw new Error(
      "useGlobalTimelineContext must be used within a GlobalTimelineProvider"
    );
  }

  return context;
};

export const GlobalTimelineProvider = ({
  children,
}: React.PropsWithChildren) => {
  return (
    <globalTimelineContext.Provider value={{}}>
      {children}
    </globalTimelineContext.Provider>
  );
};
