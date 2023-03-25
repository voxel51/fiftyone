import { createContext } from "react";
import SpaceNode from "./SpaceNode";

export const PanelContext = createContext<{ node?: SpaceNode }>({});
