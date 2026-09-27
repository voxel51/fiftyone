import { createContext } from "react";

/** Hosts can hide the tray's default assistant promotion while their placement loads. */
export const SelectionAssistantFallbackContext = createContext(true);
