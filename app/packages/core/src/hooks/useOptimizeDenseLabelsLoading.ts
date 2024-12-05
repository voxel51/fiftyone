import {
  activeFields,
  defaultVisibilityLabels,
  fieldSchema,
  State,
} from "@fiftyone/state";
import { getDenseLabelNames } from "@fiftyone/utilities";
import { useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

export const useOptimizeDenseLabelsLoading = () => {
  const defaultVisibleLabels = useRecoilValue(defaultVisibilityLabels);
  const [alreadyActiveFields, setActiveFields] = useRecoilState(
    activeFields({ modal: false })
  );

  const schema = useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));

  const denseLabels = useMemo(() => getDenseLabelNames(schema), [schema]);

  useEffect(() => {
    if (!denseLabels) {
      return;
    }

    // if no user defined defaults, turn off all dense labels
    const starting = new Set(alreadyActiveFields);

    // if (!defaultVisibleLabels?.include && !defaultVisibleLabels?.exclude) {
    // for now, exlude all dense labels
    if (true) {
      const filteredActiveFields = new Set(
        [...starting].filter((x) => !denseLabels.includes(x))
      );
      setActiveFields([...filteredActiveFields]);
    }
    return; // temporary testing

    // get a list of all dense labels

    // userDefinedDefaults = set(include) - set(exclude)
    const includeList = new Set(defaultVisibleLabels.include ?? []);
    const excludeList = new Set(defaultVisibleLabels.exclude ?? []);

    const userDefinedDefaults = new Set(
      [...includeList].filter((x) => !excludeList.has(x))
    );

    // merge with already active fields

    // setActiveFields(defaultVisibleLabels);
  }, [denseLabels, defaultVisibilityLabels]);
};
