import { createContext } from "react";
import SpaceNode from "./SpaceNode";

export const PanelContext = createContext<PanelContextType>({});

type PanelContextType = { node?: SpaceNode; scope?: string };
