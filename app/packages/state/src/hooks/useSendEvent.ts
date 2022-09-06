import { useContext } from "react";
import { EventsContext } from "../contexts";

export default (force: boolean = false) => {
  const { session } = useContext(EventsContext);

  return (send: (session: string | null) => void) => {
    if (session === undefined && !force) {
      return;
    }

    send(session || null);
  };
};
