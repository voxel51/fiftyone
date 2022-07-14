import { useContext } from "react";

import { EventsContext } from "@fiftyone/components";

export default (force: boolean = false) => {
  const { session } = useContext(EventsContext);

  return (send: (session: string | null) => void) => {
    if (session === undefined && !force) {
      return;
    }

    send(session || null);
  };
};
