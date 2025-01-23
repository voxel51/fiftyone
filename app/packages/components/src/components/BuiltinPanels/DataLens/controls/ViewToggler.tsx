import DataObjectIcon from "@mui/icons-material/DataObject";
import GridViewIcon from "@mui/icons-material/GridView";
import { useAtom } from "jotai";
import React from "react";
import { currentViewAtom } from "../state";
import { TwoIconButtonGroup } from "./shared/TwoIconButtonGroup";

export const ViewToggler = () => {
  const [currentViewMode, setCurrentViewMode] = useAtom(currentViewAtom);

  return (
    <TwoIconButtonGroup
      activeButton={currentViewMode === "grid" ? "left" : "right"}
    >
      <TwoIconButtonGroup.LeftButton onClick={() => setCurrentViewMode("grid")}>
        <GridViewIcon />
      </TwoIconButtonGroup.LeftButton>
      <TwoIconButtonGroup.RightButton
        onClick={() => setCurrentViewMode("json")}
      >
        <DataObjectIcon />
      </TwoIconButtonGroup.RightButton>
    </TwoIconButtonGroup>
  );
};
