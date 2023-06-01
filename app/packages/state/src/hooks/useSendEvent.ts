import { useContext } from "react";
import { EventsContext } from "../contexts";

export default (force = false) => {
  const { session } = useContext(EventsContext);

  return (send: (session: string | null) => void | Promise<void>) => {
    if (session === undefined && !force) {
      return;
    }

    send(session || null);
  };
};
