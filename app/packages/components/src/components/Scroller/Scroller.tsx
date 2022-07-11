import Flashlight, { FlashlightConfig } from "@fiftyone/flashlight";
import React, {
  MutableRefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { RecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import { deferrer } from "../../use";

export interface ScrollerProps<K = number> {
  get: FlashlightConfig<K>["get"];
  render: FlashlightConfig<K>["render"];
  onItemResize?: FlashlightConfig<K>["onItemResize"];
  updateItems?: [RecoilValue<any>[], MutableRefObject<(id: string) => void>];
  horizontal: boolean;
  flashlightRef: MutableRefObject<Flashlight<number> | undefined>;
  onItemClick: FlashlightConfig<K>["onItemClick"];
}

const Scroller: React.FC<ScrollerProps> = ({
  updateItems = [[], { current: () => {} }],
  flashlightRef,
  ...flashlightConfig
}) => {
  const initialized = useRef(false);
  const deferred = deferrer(initialized);
  const [id] = useState(() => uuid());
  const [flashlight] = useState(() => {
    return new Flashlight({
      initialRequestKey: 0,
      options: {
        rowAspectRatioThreshold: 0,
      },
      ...flashlightConfig,
    });
  });
  flashlightRef.current = flashlight;

  useLayoutEffect(() => {
    flashlight.attach(id);

    return () => flashlight.detach();
  }, [flashlight, id]);

  useLayoutEffect(
    deferred(() => {
      updateItems && flashlight.updateItems(updateItems[1].current);
    }),
    updateItems[0]
  );

  useEffect(() => {
    initialized.current = true;
  }, []);

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

export default Scroller;
