import React, { useContext } from "react";
export const callbacks = new Set<() => Promise<HTMLCanvasElement>>();
export const BeforeScreenshotContext = React.createContext(callbacks);

export default (cb: () => Promise<HTMLCanvasElement>) => {
  const callbacks = useContext(BeforeScreenshotContext);
  React.useEffect(() => {
    callbacks.add(cb);

    return () => {
      callbacks.delete(cb);
    };
  }, [cb, callbacks]);
};
