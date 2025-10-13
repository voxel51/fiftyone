import { useAtomValue } from "jotai";
import React from "react";
import { Redo, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import { Row } from "./Components";
import { currentOverlay, currentType } from "./state";
import useColor from "./useColor";

const Header = () => {
  const type = useAtomValue(currentType);
  const Icon = ICONS[type];
  const color = useColor(useAtomValue(currentOverlay) ?? undefined);

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
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
