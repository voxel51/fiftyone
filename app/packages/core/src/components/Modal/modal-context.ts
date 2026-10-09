import { Lookers } from "@fiftyone/state";
import React, { createContext } from "react";

interface ModalContextT {
  activeLookerRef: React.MutableRefObject<Lookers | undefined>;
  setActiveLookerRef: (looker: Lookers) => void;
  /** Whether the modal is the sample page, whose header owns the mode. */
  page?: boolean;
}

export const modalContext = createContext<ModalContextT | undefined>(undefined);
