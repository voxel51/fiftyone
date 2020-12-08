import React from "react";
import { useSetRecoilState } from "recoil";

import * as atoms from "../recoil/atoms";
import "../components/Loading";
import Loading from "../components/Loading";

const Deactivated = () => {
  const setDeactivated = useSetRecoilState(atoms.deactivated);

  return (
    <Loading
      text={"This App has been deactivated. Click here to activate"}
      onClick={() => setDeactivated(false)}
    />
  );
};

export default Deactivated;
