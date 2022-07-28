import { useRecoilState, atom } from "recoil";
import * as fos from "@fiftyone/state";
import React from "react";
import { useTheme } from "@fiftyone/components";

export default function SidebarSourceSelector({ id, children }) {
  const [current, setCurrent] = useRecoilState(fos.sidebarSource);
  const theme = useTheme();
  function handleClick() {
    setCurrent(id);
  }
  const isCurrent = current === id;
  const color = isCurrent ? theme.brand : theme.button;

  return (
    <div
      style={{
        borderTop: `solid 1px ${color}`,
        height: "100%",
      }}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}
