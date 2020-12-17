import React from "react";
import { useSetRecoilState } from "recoil";

import * as atoms from "../recoil/atoms";
import "../components/Loading";
import Loading from "../components/Loading";

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
  return <Loading text={<Click />} />;
};

export default Deactivated;
