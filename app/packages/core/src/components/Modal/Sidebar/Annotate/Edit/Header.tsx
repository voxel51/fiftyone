import { West as Back } from "@mui/icons-material";
import { useAtomValue } from "jotai";
import { useContext } from "react";
import { Redo, Round, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";

import { current3dAnnotationModeAtom } from "@fiftyone/looker-3d/src/state";
import { useRecoilValue } from "recoil";
import { ConfirmationContext } from "../Confirmation";
import { ICONS } from "../Icons";
import { Row } from "./Components";
import { currentOverlay, currentType } from "./state";
import useColor from "./useColor";

const Header = () => {
  const type = useAtomValue(currentType);
  const Icon = ICONS[type.toLowerCase()];
  const color = useColor(useAtomValue(currentOverlay) ?? undefined);
  const { onExit } = useContext(ConfirmationContext);

  const current3dAnnotationMode = useRecoilValue(current3dAnnotationModeAtom);
  const isAnnotatingPolyline = current3dAnnotationMode === "polyline";
  const isAnnotatingCuboid = current3dAnnotationMode === "cuboid";

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Round onClick={onExit}>
          <Back />
        </Round>
        {Icon && <Icon fill={color} />}
        <div>{type}</div>
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
