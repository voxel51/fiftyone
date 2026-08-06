import { useRecoilValue } from "recoil";
import { useMemo } from "react";
import { dataset as datasetAtom } from "../../recoil/dataset";
import { fieldSchema } from "../../recoil/schema";
import { State } from "../../recoil/types";

export default function useSpacesContext() {
  const schema = useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));
  const dataset = useRecoilValue(datasetAtom);
  return useMemo(() => ({ schema, dataset }), [schema, dataset]);
}
