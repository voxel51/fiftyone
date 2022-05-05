import { useContext } from "react";
import { EventsContext } from "../contexts";

export default () => {
  const { session } = useContext(EventsContext);

  return (send: (session: string | null) => void) => {
    if (session === undefined) {
      return;
    }

    send(session);
  };
};
