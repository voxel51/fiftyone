import React, { useRef } from "react";
import { useSetRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";

const Click = () => {
  const setDeactivated = useSetRecoilState(atoms.deactivated);

  return (
    <p>
      This App has been deactivated.{" "}
      <a onClick={() => setDeactivated(false)}>Click here</a> to activate.
    </p>
  );
};

const Deactivated = () => {
  const canvas = useRecoilValue(atoms.canvas);
  const ref = useRef();
  return (
    <img
      style={{
        height: "100%",
        width: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 20000,
      }}
      src={canvas}
      ref={ref}
    />
  );
};

export default Deactivated;
