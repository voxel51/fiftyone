import { Lookers } from "@fiftyone/state";
import React, { createContext } from "react";

/** Steps to the next or previous sample, as the modal's navigation does. */
export interface ModalStepper {
  next: () => void;
  previous: () => void;
}

interface ModalContextT {
  activeLookerRef: React.MutableRefObject<Lookers | undefined>;
  setActiveLookerRef: (looker: Lookers) => void;
  /** Whether the modal is the sample page, whose header owns the mode. */
  page?: boolean;
  /** Filled by the modal's navigation, so a page header can step with it. */
  stepperRef?: React.MutableRefObject<ModalStepper | null>;
}

export const modalContext = createContext<ModalContextT | undefined>(undefined);
