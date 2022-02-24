import { getFetchHost, Resource, SSEClient } from "@fiftyone/utilities";
import React, { useContext, useState } from "react";

export let UpdateContext: React.Context<SSEClient>;

let connectionResourse: Resource<{}>;

const withUpdates = <P extends {}>(Component: React.FC<P>) => (props: P) => {
  const [update] = useState(() => new SSEClient(`${getFetchHost()}/state`, {}));
  UpdateContext = React.createContext(update);

  const client = useContext(UpdateContext);

  client.addEventListener("readystatechange", (...args) => {
    console.log(client.readyState, args);
  });

  return (
    <UpdateContext.Provider value={update}>
      <Component {...props} />
    </UpdateContext.Provider>
  );
};

export default withUpdates;
