import * as fos from "@fiftyone/state";
import { FLOAT_FIELD } from "@fiftyone/utilities";
import React from "react";
import {
  RecoilValueReadOnly,
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import Checkbox from "../../Common/Checkbox";
import * as state from "./state";

interface NonfiniteState {
  value: boolean;
  setValue: SetterOrUpdater<boolean>;
  count?: number;
  subcountAtom?: RecoilValueReadOnly<number>;
}

const NONFINITES = {
  nan: "nan",
  ninf: "-inf",
  inf: "inf",
  none: null,
};

const useNonfiniteData = (params: {
  modal: boolean;
  path: string;
  defaultRange?: [number, number];
}) => {
  function useData(key: fos.Nonfinite): [fos.Nonfinite, NonfiniteState] {
    const [value, setValue] = useRecoilState(
      fos.nonfiniteAtom({ ...params, key })
    );

    return [
      key,
      {
        setValue,
        value,
        subcountAtom: fos.nonfiniteCount({
          ...params,
          extended: true,
          key,
        }),
      },
    ];
  }

  return useData;
};

const useNonfinites = (options: {
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}): [fos.Nonfinite, NonfiniteState][] => {
  const get = useNonfiniteData(options);
  const data = [get("none")];
  const { ftype } = fos.useAssertedRecoilValue(fos.field(options.path));

  if (ftype === FLOAT_FIELD) {
    state.FLOAT_NONFINITES.forEach((key) => data.push(get(key)));
  }

  return data.filter(([_, { count }]) => count !== undefined && count > 0);
};

function Nonfinites({
  defaultRange,
  modal,
  path,
}: {
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}) {
  const color = useRecoilValue(fos.pathColor(path));
  const nonfinites = useNonfinites({
    modal,
    path,
    defaultRange,
  });
  const hasBounds = useRecoilValue(state.hasBounds({ defaultRange, path }));
  const one = useRecoilValue(state.oneBound({ defaultRange, path }));

  return (
    <>
      {nonfinites.map(([key, props]) => (
        <Checkbox
          key={key}
          color={color}
          name={NONFINITES[key]}
          forceColor={true}
          disabled={one && nonfinites.length === 1 && !(one && hasBounds)}
          {...props}
        />
      ))}
    </>
  );
}

export default Nonfinites;
