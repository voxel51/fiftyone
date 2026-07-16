import { useRecoilValue } from "recoil";
import { fieldSchema, State, dataset as datasetAtom } from "../../recoil";
import { useMemo } from "react";

export default function useSpacesContext() {
  const schema = useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));
  const dataset = useRecoilValue(datasetAtom);
  return useMemo(() => ({ schema, dataset }), [schema, dataset]);
}
