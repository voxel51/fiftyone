import { formatValueAsNumber } from "@fiftyone/utilities";
import { capitalize } from "lodash";
import { atom } from "recoil";
import { NONE_CLASS } from "./constants";

export function getNumericDifference(
  value,
  compareValue,
  percentage = false,
  fractionDigits?: number
) {
  if (typeof value === "number" && typeof compareValue === "number") {
    const difference = value - compareValue;
    const sanitizedCompareValue = compareValue === 0 ? 1 : compareValue;
    if (percentage) {
      const percentageDifference = (difference / sanitizedCompareValue) * 100;
      return formatValueAsNumber(percentageDifference, fractionDigits);
    }
    return formatValueAsNumber(difference, fractionDigits);
  }
  return NaN;
}

export function getClasses(
  matrixData: MatrixData,
  maskTargets?: MaskTargets["primary"]
) {
  if (!matrixData) return [];
  return matrixData.classes.map((c) => {
    return maskTargets?.[c] || c;
  });
}

export interface CompareKey {
  key: string;
  type: string;
  method: string;
  disabled: boolean;
  tooltip: string;
  tooltipBody: string;
}

export function computeSortedCompareKeys(
  evaluations: any[],
  currentName: string,
  currentType: string,
  currentMethod: string
): CompareKey[] {
  return evaluations
    .filter((evaluation) => evaluation.key !== currentName)
    .map((evaluation) => ({
      key: evaluation.key,
      type: evaluation.type,
      method: evaluation.method,
      disabled: !(
        evaluation.type === currentType && evaluation.method === currentMethod
      ),
      tooltip: `Evaluation Type: ${capitalize(currentType)}`,
      tooltipBody: !(
        evaluation.type === currentType && evaluation.method === currentMethod
      )
        ? `Note: Comparisons are only valid between evaluations of the same type and method.`
        : undefined,
    }))
    .sort((a, b) => {
      // First, non-disabled items come first
      if (a.disabled !== b.disabled) {
        return a.disabled ? 1 : -1;
      }
      // Next, items with type equal to currentType come first
      if ((a.type === currentType) !== (b.type === currentType)) {
        return a.type === currentType ? -1 : 1;
      }
      // Finally, sort alphabetically by key to ensure deterministic order
      return a.key.localeCompare(b.key);
    });
}

/**
 * Atom state to control the visibility of the delete evaluation dialog
 */
export const openModelEvalDialog = atom<boolean>({
  key: "openModelEvalDialog",
  default: false,
});

/**
 * Atom state to store the currently selected model evaluation key to act on.
 * Contains the name and id of the selected evaluation.
 */
export const selectedModelEvaluation = atom<string | null>({
  key: "selectedModelEvaluation",
  default: null,
});

export function getEvaluationType(evaluation) {
  const config = evaluation?.info?.config;
  const method = config?.method;
  const type = config?.type;
  if (type === "classification") {
    return method === "binary"
      ? "binary_classification"
      : "multiclass_classification";
  }
  return type;
}

export function getInapplicableMetrics(evaluation) {
  const type = getEvaluationType(evaluation);

  const isObjectDetection = type === "detection";
  const isSegmentation = type === "segmentation";
  const isMulticlassClassification = type === "multiclass_classification";

  const inapplicableMetrics: string[] = [];

  if (isSegmentation) {
    inapplicableMetrics.push(
      "prediction_statistics",
      "confidence_distribution",
      "average_confidence",
      "tp",
      "fp",
      "fn"
    );
  }

  if (!isObjectDetection) {
    inapplicableMetrics.push("iou", "mAP", "mAR");
  }

  if (isMulticlassClassification) {
    inapplicableMetrics.push("tp", "fp", "fn");
  } else {
    inapplicableMetrics.push("correct", "incorrect");
  }

  return inapplicableMetrics;
}

export function getConfusionMatrix(
  classes: string[],
  matrix: number[][],
  masks?: MaskTargets,
  options?: MatrixOptions
) {
  const classesWithCount: ClassWithCount[] = [];
  const classIndexMap: Record<string, number> = {};
  const {
    sortBy,
    skipZeroCount = true,
    classes: includedClasses,
    limit,
  } = options || {};
  const { primary: primaryMasks, secondary: secondaryMasks } = masks ?? {};
  const hasIncludedClasses =
    Array.isArray(includedClasses) && includedClasses?.length > 0;

  classes.forEach((currentClass, index) => {
    const count = matrix[index][index];
    const skipClass =
      hasIncludedClasses && !includedClasses.includes(currentClass);
    const isZeroCount = skipZeroCount && count === 0;
    if (skipClass || isZeroCount) return;
    classesWithCount.push({ class: currentClass, count });
    classIndexMap[currentClass] = index;
  });

  const sortedClassesWithCount = classesWithCount.sort(
    (a: ClassWithCount, b: ClassWithCount) => {
      // Ensure (none) class is always at the end
      if (a.class === NONE_CLASS) {
        return 1;
      }
      if (b.class === NONE_CLASS) {
        return -1;
      }
      // sort alphabetically by a class (az: a to z, za: z to a)
      if (sortBy === "az") return a.class.localeCompare(b.class);
      if (sortBy === "za") return b.class.localeCompare(a.class);
      // sort by number of occurrence of both predicted and actual being same
      //  (mc: most common, lc: least common)
      if (sortBy === "mc") return b.count - a.count;
      if (sortBy === "lc") return a.count - b.count;

      // default to no sorting
      return 0;
    }
  );
  const sortedClasses = sortedClassesWithCount.map((item) => item.class);
  const computedClasses = sortedClasses.slice(0, limit || sortedClasses.length);

  // Add (none) class at the end if it exists in the original classes
  if (
    classes.includes(NONE_CLASS) &&
    !computedClasses.includes(NONE_CLASS) &&
    !hasIncludedClasses
  ) {
    computedClasses.push(NONE_CLASS);
    classIndexMap[NONE_CLASS] = classes.indexOf(NONE_CLASS);
  }

  const sortedMatrix: number[][] = [];
  computedClasses.forEach((currentClass) => {
    const row: number[] = [];
    const originalRowIndex = classIndexMap[currentClass];
    computedClasses.forEach((innerClass) => {
      const originalColIndex = classIndexMap[innerClass];
      row.push(matrix[originalRowIndex][originalColIndex]);
    });
    sortedMatrix.push(row);
  });

  const maskedClasses =
    primaryMasks || secondaryMasks
      ? computedClasses.map((currentClass) => {
          return (
            primaryMasks?.[currentClass] ||
            secondaryMasks?.[currentClass] ||
            currentClass
          );
        })
      : computedClasses;

  return { classes: maskedClasses, matrix: sortedMatrix };
}

export function getConfusionMatrixPlotlyData(
  data: MatrixData,
  config: MatrixPlotDataConfig
) {
  const {
    classes: originalClasses,
    matrix: originalMatrix,
    colorscales,
    maskTargets,
  } = data;
  const { classes, matrix } = getConfusionMatrix(
    originalClasses,
    originalMatrix,
    maskTargets,
    config
  );
  const colorscale = config.log
    ? colorscales?.logarithmic
    : colorscales?.default;

  return [
    {
      z: matrix,
      x: classes,
      y: classes,
      type: "heatmap",
      colorscale,
      hovertemplate:
        [
          "<b>count: %{z:d}</b>",
          `${config?.gtField || "truth"}: %{y}`,
          `${config?.predField || "predicted"}: %{x}`,
        ].join(" <br>") + "<extra></extra>",
    },
  ];
}

type MatrixData = {
  classes: string[];
  matrix: number[][];
  colorscales?: {
    default: Array<[number, string]>;
    logarithmic: Array<[number, string]>;
  };
  maskTargets?: MaskTargets;
};

type MatrixOptions = {
  sortBy: "az" | "za" | "mc" | "lc";
  limit?: number;
  classes?: string[];
  skipZeroCount?: boolean;
};

type MatrixPlotDataConfig = MatrixOptions & {
  log?: boolean;
  gtField?: string;
  predField?: string;
};

type ClassWithCount = {
  class: string;
  count: number;
};

type MaskTargets = {
  primary: Record<string, string>;
  secondary?: Record<string, string>;
};
