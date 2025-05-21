import { State, fieldSchema } from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import type { Field, Renderer } from "./registerRenderer";
import { type Data, RENDERERS } from "./registerRenderer";

type Renderings = { [key: string]: Renderer | undefined };

const accumulateRenderings = (
  path: string,
  field: Field,
  renderings: Renderings
) => {
  for (const renderer of RENDERERS) {
    if (renderer.activator(field)) {
      renderings[path] = renderer;
    }
  }

  const fields = field.fields || {};
  for (const key in fields) {
    accumulateRenderings(`path.${key}`, fields[key], renderings);
  }
};

export const useRendering = <D extends Data>() => {
  const schema = useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));
  const renderings = useMemo(() => {
    const results: Renderings = {};
    for (const key in schema) {
      accumulateRenderings(key, schema[key], results);
    }
    return results;
  }, [schema]);

  return {
    create: (data) => {
      return 1;
    },
  };
};
