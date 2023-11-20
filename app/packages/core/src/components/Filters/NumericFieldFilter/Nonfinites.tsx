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
  subcountAtom?: RecoilValueReadOnly<number>;
}

const NONFINITES = {
  nan: "nan",
  ninf: "-inf",
  inf: "inf",
  none: null,
};

const useNonfiniteSettings = (params: { modal: boolean; path: string }) => {
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

const useNonfinites = (options: { modal: boolean; path: string }) => {
  const get = useNonfiniteSettings(options);
  const list = [get("none")];
  const { ftype } = fos.useAssertedRecoilValue(fos.field(options.path));
  const data = useRecoilValue(
    fos.nonfiniteData({
      extended: false,
      path: options.path,
      modal: options.modal,
    })
  );
  if (ftype === FLOAT_FIELD) {
    state.FLOAT_NONFINITES.forEach((key) => list.push(get(key)));
  }

  return list
    .filter(([key]) => data[key])
    .map(([key, d]) => ({
      key,
      ...d,
      count: (typeof data[key] === "number" ? data[key] : undefined) as
        | number
        | undefined,
    }));
};

function Nonfinites({ modal, path }: { modal: boolean; path: string }) {
  const color = useRecoilValue(fos.pathColor(path));
  const nonfinites = useNonfinites({
    modal,
    path,
  });
  const hasBounds = useRecoilValue(state.hasBounds(path));
  const one = useRecoilValue(state.oneBound(path));
  const lightning = useRecoilValue(fos.lightning);
  const lightningPath = useRecoilValue(fos.isLightningPath(path));

  if (lightning && lightningPath && nonfinites.length) {
    return (
      <span style={{ color: "var(--fo-palette-danger-plainColor)" }}>
        {nonfinites.map(({ key }) => key).join(", ")} present
      </span>
    );
  }

  if (nonfinites.length == 1 && nonfinites[0].key === "none") {
    return null;
  }

  return (
    <>
      {nonfinites.map(({ key, ...props }) => (
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
