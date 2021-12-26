import { LIST_FIELD } from "@fiftyone/utilities";
import React from "react";
import { useRecoilValue } from "recoil";

import * as atoms from "../../../recoil/atoms";
import * as schemaAtoms from "../../../recoil/schema";
import { prettify } from "../../../utils/generic";
import RegularEntry from "./RegularEntry";

const PathValueEntry = ({ path }: { path: string }) => {
  const field = useRecoilValue(schemaAtoms.field(path));
  let { sample: data } = useRecoilValue(atoms.modal);

  path.split(".").forEach((key) => (data = data[key]));

  if (field.ftype !== LIST_FIELD) {
    const value = prettify((data as unknown) as string);
    return <RegularEntry title={value} heading={value} />;
  }

  return null;
};

export default React.memo(PathValueEntry);
