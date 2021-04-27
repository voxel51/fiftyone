import React from "react";
import { selector, useRecoilValue } from "recoil";
import { Autorenew } from "@material-ui/icons";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import { PopoutSectionTitle, TabOption } from "../utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PATCHES_FIELDS } from "../../utils/labels";

type PatcherProps = {
  modal: boolean;
};

const patchesFields = selector({
  key: "parchesFields",
  get: ({ get }) => {
    const paths = get(selectors.labelPaths);
    const types = get(selectors.labelTypesMap);
    return paths.filter((p) => PATCHES_FIELDS.includes(types[p]));
  },
});

const Patcher = ({ modal, bounds }: PatcherProps) => {
  const fields = useRecoilValue(patchesFields);
  return (
    <Popout modal={modal} bounds={bounds}>
      <PopoutSectionTitle>Label patches</PopoutSectionTitle>
      {fields.map((field) => {
        return (
          <ActionOption
            text={field}
            title={`Switch to ${field} patches view`}
            disabled={false}
            onClick={() => {}}
          />
        );
      })}
    </Popout>
  );
};

export default React.memo(Patcher);
