import type { AnnotationLabel } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React from "react";
import { Redo, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import useColor from "../useColor";
import { Row } from "./Components";
import { currentField } from "./state";

const Header = ({ label }: { label: AnnotationLabel }) => {
  const Icon = ICONS[label.type];
  const path = useAtomValue(currentField);
  const color = useColor(path ?? undefined);

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Icon fill={color} />
        <div>{label.type}</div>
      </ItemLeft>
      <ItemRight>
        <Undo />
        <Redo />
      </ItemRight>
    </Row>
  );
};

export default Header;
