import { Close } from "@mui/icons-material";
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
  const { exit } = useContext(ConfirmationContext);

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Icon fill={color} />
        <div>{type}</div>
      </ItemLeft>
      <ItemRight>
        <Undo />
        <Redo />
        <Round onClick={exit}>
          <Close />
        </Round>
      </ItemRight>
    </Row>
  );
};

export default Header;
