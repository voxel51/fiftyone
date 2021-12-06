import React from "react";
import { useRecoilValue } from "recoil";

import * as atoms from "../../../recoil/atoms";
import * as schemaAtoms from "../../../recoil/schema";
import { prettify } from "../../../utils/generic";
import RegularEntry from "./RegularEntry";

const PathValueEntry = ({ path }: { path: string }) => {
  const field = useRecoilValue(schemaAtoms.field(path));
  let { sample: data } = useRecoilValue(atoms.modal);

  path.split(".").forEach((key) => {
    data = data[key];
  });

  const value = prettify(data);

  return <RegularEntry title={value} heading={value} />;
};

export default React.memo(PathValueEntry);
