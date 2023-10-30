import { useContext } from "react";
import { RouterContext } from "./RouterContext";

const useRouterContext = () => {
  const context = useContext(RouterContext);

  if (!context) {
    throw new Error("RouterContext is undefined");
  }

  return context;
};

export default useRouterContext;
