import Flashlight, { FlashlightConfig } from "@fiftyone/flashlight";
import React, { useLayoutEffect, useState } from "react";
import { v4 as uuid } from "uuid";

export interface ScrollerProps<K = number> {
  get: FlashlightConfig<K>["get"];
  render: FlashlightConfig<K>["render"];
  onItemResize?: FlashlightConfig<K>["onItemResize"];
  horizontal: boolean;
}

const Scroller: React.FC<ScrollerProps> = ({ ...flashlightConfig }) => {
  const [id] = useState(() => uuid());
  const [flashlight] = useState(
    () =>
      new Flashlight({
        initialRequestKey: 0,
        options: {
          rowAspectRatioThreshold: 0,
        },
        ...flashlightConfig,
      })
  );

  useLayoutEffect(() => {
    flashlight.attach(id);
  }, [flashlight, id]);

  return (
    <div
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        position: "relative",
        paddingLeft: "1rem",
      }}
      id={id}
    ></div>
  );
};

export default Scroller;
