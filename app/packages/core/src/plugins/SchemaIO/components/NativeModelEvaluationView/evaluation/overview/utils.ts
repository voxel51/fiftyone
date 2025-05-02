import { view } from "@fiftyone/state";
import { useRecoilState } from "recoil";
import {
  CONFUSION_MATRIX_SORT_OPTIONS,
  DEFAULT_BAR_CONFIG,
} from "../../constants";
import { CLASS_PERFORMANCE_SORT_OPTIONS } from "./constants";

export function useActiveFilter(evaluation, compareEvaluation) {
  const evalKey = evaluation?.info?.key;
  const compareKey = compareEvaluation?.info?.key;
  const [stages] = useRecoilState(view);
  if (stages?.length >= 1) {
    const stage = stages[0];
    const { _cls, kwargs } = stage;
    if (_cls.endsWith("FilterLabels")) {
      const [_, filter] = kwargs;
      const filterEq = filter[1].$eq || [];
      const [filterEqLeft, filterEqRight] = filterEq;
      if (filterEqLeft === "$$this.label") {
        return { type: "label", value: filterEqRight };
      } else if (filterEqLeft === `$$this.${evalKey}`) {
        return {
          type: "metric",
          value: filterEqRight,
          isCompare: false,
        };
      } else if (filterEqLeft === `$$this.${compareKey}`) {
        return {
          type: "metric",
          value: filterEqRight,
          isCompare: true,
        };
      }
    }
  }
}

export function getConfigLabel({ config, type, dashed }) {
  const { sortBy } = config;
  if (!sortBy || sortBy === DEFAULT_BAR_CONFIG.sortBy) return "";
  const sortByLabels =
    type === "classPerformance"
      ? CLASS_PERFORMANCE_SORT_OPTIONS
      : CONFUSION_MATRIX_SORT_OPTIONS;
  const sortByLabel = sortByLabels.find(
    (option) => option.value === sortBy
  )?.label;
  return dashed ? ` - ${sortByLabel}` : sortByLabel;
}
