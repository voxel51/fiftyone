import { useEffect, useState } from "react";
import {
  fetchColor,
  fetchColorByChoices,
  type ColorMeta,
  type ColorValues,
  type VisualizationRun,
} from "./protocol";

/**
 * Color-by support: the run-dependent field choices, the raw value
 * column for the selected field (`values` — the hover card's swatch
 * reads it), and the field's meta (classes/counts for the legend). Both
 * `values` and `meta` are null while no field is selected or a fetch is
 * in flight — they clear immediately on any input change so a stale
 * column never colors another run's points.
 */
export function useColorColumn(
  datasetName: string | null,
  brainKey: string | null,
  run: VisualizationRun | null,
  colorField: string | null,
): {
  choices: string[];
  values: ColorValues | null;
  meta: ColorMeta | null;
  /** A column fetch is in flight — the field's first hit aggregates
   * server-side and can take seconds at scale, so hosts show progress */
  loading: boolean;
  error: string | null;
} {
  const [choices, setChoices] = useState<string[]>([]);
  const [values, setValues] = useState<ColorValues | null>(null);
  const [meta, setMeta] = useState<ColorMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Color-by field choices depend on the run (patches vs samples)
  useEffect(() => {
    // The previous run's fields must not populate the new run's menu
    setChoices([]);
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
    setValues(null);
    setMeta(null);
    // A stale failure must not banner over a later successful field
    setError(null);
    if (!datasetName || !brainKey || !colorField) {
      setLoading(false);
      return undefined;
    }
    let stale = false;
    setLoading(true);
    fetchColor(datasetName, brainKey, colorField)
      .then(({ values: column, meta: fieldMeta }) => {
        if (stale) return;
        setValues(column);
        setMeta(fieldMeta);
      })
      .catch((e) => !stale && setError(String(e)))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, colorField]);

  return { choices, values, meta, loading, error };
}
