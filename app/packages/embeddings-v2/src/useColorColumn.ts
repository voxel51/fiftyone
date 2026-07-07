import { useEffect, useState } from "react";
import { buildColors } from "./colors";
import {
  fetchColorByChoices,
  fetchColorMeta,
  fetchColorValues,
  type VisualizationRun,
} from "./protocol";

/**
 * Color-by support: the run-dependent field choices and the built rgb
 * column for the selected field. `colors` is null while no field is
 * selected or a fetch is in flight — the column clears immediately on
 * any input change so a stale column never colors another run's points.
 */
export function useColorColumn(
  datasetName: string | null,
  brainKey: string | null,
  run: VisualizationRun | null,
  colorField: string | null,
): {
  choices: string[];
  colors: Float32Array | null;
  error: string | null;
} {
  const [choices, setChoices] = useState<string[]>([]);
  const [colors, setColors] = useState<Float32Array | null>(null);
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
    if (!datasetName || !brainKey || !colorField) return undefined;
    let stale = false;
    Promise.all([
      fetchColorValues(datasetName, brainKey, colorField),
      fetchColorMeta(datasetName, brainKey, colorField),
    ])
      .then(([values, meta]) => {
        if (stale) return;
        setColors(
          buildColors(values, { min: meta.min ?? null, max: meta.max ?? null }),
        );
      })
      .catch((e) => !stale && setError(String(e)));
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, colorField]);

  return { choices, colors, error };
}
