import Flashlight, { FlashlightConfig } from "@fiftyone/flashlight";
import React, { useLayoutEffect, useState } from "react";
import { v4 as uuid } from "uuid";

export interface ColumnScrollerProps<K = number> {
  get: FlashlightConfig<K>["get"];
  render: FlashlightConfig<K>["render"];
  onItemResize?: FlashlightConfig<K>["onItemResize"];
}

const ColumnScroller: React.FC<ColumnScrollerProps> = ({
  ...flashlightConfig
}) => {
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
      }}
      id={id}
    ></div>
  );
};

export default ColumnScroller;
