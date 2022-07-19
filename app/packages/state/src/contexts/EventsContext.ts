import React from "react";

export interface EventsSink {
  session?: string | null;
}

export default React.createContext<EventsSink>({});
