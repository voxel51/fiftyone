import React from "react";
import { RecoilState, useRecoilState } from "recoil";

import { TabOption } from "@fiftyone/components";

interface ExcludeOptionProps {
  excludeAtom: RecoilState<boolean>;
  valueName: string;
  color: string;
}

const ExcludeOption = React.memo(
  ({ excludeAtom, valueName, color }: ExcludeOptionProps) => {
    const [excluded, setExcluded] = useRecoilState(excludeAtom);
    return (
      <TabOption
        active={excluded ? "Exclude" : "Select"}
        color={color}
        options={[
          {
            text: "Select",
            title: `Select ${valueName}`,
            onClick: () => excluded && setExcluded(false),
          },
          {
            text: "Exclude",
            title: `Exclude ${valueName}`,
            onClick: () => !excluded && setExcluded(true),
          },
        ]}
      />
    );
  }
);

export default ExcludeOption;
