import { useState } from "react";

export const AssetWrapper = ({ children }: { children: React.ReactNode }) => {
  const [hovered, setHovered] = useState(false);

  // todo: this is causing serious drop in fps, investigate why
  //   useCursor(hovered);

  return (
    <group
    //   onPointerOver={() => setHovered(true)}
    //   onPointerOut={() => setHovered(false)}
    >
      {children}
    </group>
  );
};
