import { West as Back } from "@mui/icons-material";
import { useAtom, useAtomValue } from "jotai";
import { useContext } from "react";
import { Redo, Round, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";

import { useLighter } from "@fiftyone/lighter";
import { current3dAnnotationModeAtom } from "@fiftyone/looker-3d/src/state";
import { useRecoilValue } from "recoil";
import { ConfirmationContext } from "../Confirmation";
import { ICONS } from "../Icons";
import { Row } from "./Components";
import {
  quickDrawActiveAtom,
  currentAnnotationModeAtom,
  currentOverlay,
  currentType,
} from "./state";
import useColor from "./useColor";

const Header = () => {
  const type = useAtomValue(currentType);
  const Icon = ICONS[type?.toLowerCase() ?? ""];
  const color = useColor(useAtomValue(currentOverlay) ?? undefined);
  const { onExit } = useContext(ConfirmationContext);
  const { scene } = useLighter();

  const [, setCurrentAnnotationMode] = useAtom(currentAnnotationModeAtom);
  const [, setQuickDrawActive] = useAtom(quickDrawActiveAtom);

  const current3dAnnotationMode = useRecoilValue(current3dAnnotationModeAtom);
  const isAnnotatingPolyline = current3dAnnotationMode === "polyline";
  const isAnnotatingCuboid = current3dAnnotationMode === "cuboid";

  const handleExit = () => {
    // Exit quick draw mode
    setCurrentAnnotationMode(null);
    setQuickDrawActive(false);
    scene?.exitInteractiveMode();

    // Call original exit handler
    onExit();
  };

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Round onClick={handleExit}>
          <Back />
        </Round>
        {Icon && <Icon fill={color} />}
        <div>Edit {type}</div>
      </ItemLeft>
      {!isAnnotatingPolyline && !isAnnotatingCuboid && (
        <ItemRight>
          <Undo />
          <Redo />
        </ItemRight>
      )}
    </Row>
  );
};

export default Header;
