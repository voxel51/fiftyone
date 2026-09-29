import * as fos from "@fiftyone/state";
import { FLOAT_FIELD } from "@fiftyone/utilities";
import {
  type ReverbValueReadOnly,
  type SetterOrUpdater,
  useAssertedReverbValue,
  useReverbState,
  useReverbValue,
} from "@fiftyone/reverb";
import Checkbox from "../../Common/Checkbox";
import * as state from "./state";

interface NonfiniteState {
  value: boolean;
  setValue: SetterOrUpdater<boolean>;
  subcountAtom?: ReverbValueReadOnly<number>;
}

const NONFINITES = {
  nan: "nan",
  ninf: "-inf",
  inf: "inf",
  none: null,
};

const useNonfiniteSettings = (params: { modal: boolean; path: string }) => {
  function useData(key: fos.Nonfinite): [fos.Nonfinite, NonfiniteState] {
    const [value, setValue] = useReverbState(
      fos.nonfiniteAtom({ ...params, key }),
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
  const { ftype, subfield } = useAssertedReverbValue(fos.field(options.path));
  const data = useReverbValue(
    fos.nonfiniteData({
      extended: false,
      path: options.path,
      modal: options.modal,
    }),
  );
  if (ftype === FLOAT_FIELD || subfield === FLOAT_FIELD) {
    for (const key of state.FLOAT_NONFINITES) {
      list.push(get(key));
    }
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
  const color = useReverbValue(fos.pathColor(path));
  const nonfinites = useNonfinites({
    modal,
    path,
  });
  const hasBounds = useReverbValue(state.hasBounds({ modal, path }));
  const one = useReverbValue(state.oneBound({ modal, path }));

  if (nonfinites.length === 1 && nonfinites[0].key === "none") {
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
          disabled={Boolean(
            one && nonfinites.length === 1 && !(one && hasBounds),
          )}
          {...props}
        />
      ))}
    </>
  );
}

export default Nonfinites;
