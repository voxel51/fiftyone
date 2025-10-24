import { West as Back } from "@mui/icons-material";
import { useAtomValue } from "jotai";
import React, { useContext } from "react";
import { Redo, Round, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";

import { ConfirmationContext } from "../Confirmation";
import { ICONS } from "../Icons";
import { Row } from "./Components";
import { currentOverlay, currentType } from "./state";
import useColor from "./useColor";

const Header = () => {
  const type = useAtomValue(currentType);
  const Icon = ICONS[type];
  const color = useColor(useAtomValue(currentOverlay) ?? undefined);
  const { onExit } = useContext(ConfirmationContext);

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Round onClick={onExit}>
          <Back />
        </Round>
        <Icon fill={color} />
        <div>{type}</div>
      </ItemLeft>
      <ItemRight>
        <Undo />
        <Redo />
      </ItemRight>
    </Row>
  );
};

export default Header;
