import { useEffect, useState } from "react";
import { buildColors } from "./colors";
import {
  fetchColor,
  fetchColorByChoices,
  type ColorMeta,
  type ColorValues,
  type VisualizationRun,
} from "./protocol";

/**
 * Color-by support: the run-dependent field choices, the built rgb
 * column for the selected field, the raw value column (`values` — the
 * legend's click-to-highlight scans it), and the field's meta
 * (classes/counts for the legend). All of `colors`/`values`/`meta` are
 * null while no field is selected or a fetch is in flight — they clear
 * immediately on any input change so a stale column never colors
 * another run's points.
 */
export function useColorColumn(
  datasetName: string | null,
  brainKey: string | null,
  run: VisualizationRun | null,
  colorField: string | null,
): {
  choices: string[];
  colors: Float32Array | null;
  values: ColorValues | null;
  meta: ColorMeta | null;
  error: string | null;
} {
  const [choices, setChoices] = useState<string[]>([]);
  const [colors, setColors] = useState<Float32Array | null>(null);
  const [values, setValues] = useState<ColorValues | null>(null);
  const [meta, setMeta] = useState<ColorMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Color-by field choices depend on the run (patches vs samples)
  useEffect(() => {
    if (!datasetName || !run) return undefined;
    let stale = false;
    fetchColorByChoices(datasetName, run.patchesField)
      .then((fields) => !stale && setChoices(fields))
      .catch(() => !stale && setChoices([]));
    return () => {
      stale = true;
    };
  }, [datasetName, run]);

  useEffect(() => {
    setColors(null);
    setValues(null);
    setMeta(null);
    if (!datasetName || !brainKey || !colorField) return undefined;
    let stale = false;
    fetchColor(datasetName, brainKey, colorField)
      .then(({ values: column, meta: fieldMeta }) => {
        if (stale) return;
        setColors(
          buildColors(column, {
            min: fieldMeta.min ?? null,
            max: fieldMeta.max ?? null,
          }),
        );
        setValues(column);
        setMeta(fieldMeta);
      })
      .catch((e) => !stale && setError(String(e)));
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, colorField]);

  return { choices, colors, values, meta, error };
}
