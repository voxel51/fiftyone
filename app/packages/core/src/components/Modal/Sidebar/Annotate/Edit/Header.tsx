import { West as Back } from "@mui/icons-material";
import { useAtomValue } from "jotai";
import { Redo, Round, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";

import { useLighter } from "@fiftyone/lighter";
import { current3dAnnotationModeAtom } from "@fiftyone/looker-3d/src/state";
import { useRecoilValue } from "recoil";
import { ICONS } from "../Icons";
import { Row } from "./Components";
import { currentOverlay, currentType } from "./state";
import useColor from "./useColor";
import { useQuickDraw } from "./useQuickDraw";
import useExit from "./useExit";

const Header = () => {
  const type = useAtomValue(currentType);
  const Icon = ICONS[type?.toLowerCase() ?? ""];
  const color = useColor(useAtomValue(currentOverlay) ?? undefined);

  const onExit = useExit();
  const { scene } = useLighter();
  const { disableQuickDraw } = useQuickDraw();

  const current3dAnnotationMode = useRecoilValue(current3dAnnotationModeAtom);
  const isAnnotatingPolyline = current3dAnnotationMode === "polyline";
  const isAnnotatingCuboid = current3dAnnotationMode === "cuboid";

  const handleExit = () => {
    disableQuickDraw();
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
