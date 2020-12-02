import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";

import App from "./containers/App";
import Setup from "./containers/Setup";

import * as atoms from "./recoil/atoms";

function Routes() {
  const connected = useRecoilValue(atoms.connected);
  return (
    <Suspense fallback={<Setup />}>
      <App />
    </Suspense>
  );
}

export default Routes;
