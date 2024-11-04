import { Lookers } from "@fiftyone/state";
import React, { createContext } from "react";

interface ModalContextT {
  activeLookerRef: React.MutableRefObject<Lookers | undefined>;
  setActiveLookerRef: (looker: Lookers) => void;
}

export const modalContext = createContext<ModalContextT | undefined>(undefined);
