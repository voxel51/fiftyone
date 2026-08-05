import { useEffect, useRef, useState } from "react";
import type { ColorColumnSource } from "./extensions";
import { buildColors, DEFAULT_RAMP, type RampId } from "./colors";
import {
  fetchColor,
  fetchColorByChoices,
  type ColorMeta,
  type ColorResponse,
  type ColorValues,
  type VisualizationRun,
} from "./protocol";

/**
 * Color-by support: the run-dependent field choices, the built rgb
 * column for the selected field, the raw value column (`values` — the
 * hover card's swatch reads it), and the field's meta (classes/counts
 * for the legend). All of `colors`/`values`/`meta` are null while no
 * field is selected or a fetch is in flight — they clear immediately
 * on any input change so a stale column never colors another run's
 * points.
 */
export function useColorColumn(
  datasetName: string | null,
  brainKey: string | null,
  run: VisualizationRun | null,
  colorField: string | null,
  /** An extension-owned column source: its choices replace the schema-derived
   * ones and its resolver replaces the server fetch. Leaves the server path
   * untouched when null. */
  source: ColorColumnSource | null = null,
  /** Which continuous ramp values map through. The legend draws the same one,
   * so a mismatch here shows points in a palette the legend never mentions. */
  rampId: RampId = DEFAULT_RAMP,
): {
  choices: string[];
  colors: Float32Array | null;
  values: ColorValues | null;
  meta: ColorMeta | null;
  /** A column fetch is in flight — the field's first hit aggregates
   * server-side and can take seconds at scale, so hosts show progress */
  loading: boolean;
  error: string | null;
} {
  const [choices, setChoices] = useState<string[]>([]);
  const [colors, setColors] = useState<Float32Array | null>(null);
  const [values, setValues] = useState<ColorValues | null>(null);
  const [meta, setMeta] = useState<ColorMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read the freshest resolver without depending on its identity: an
  // extension-supplied source can be recreated every render, and depending
  // on it directly would restart an in-flight resolve for no reason
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const hasSource = Boolean(source);

  // Color-by field choices depend on the run (patches vs samples)
  useEffect(() => {
    // The previous run's fields must not populate the new run's menu
    setChoices([]);
    if (source) {
      setChoices(source.choices);
      return undefined;
    }
    if (!datasetName || !run) return undefined;
    let stale = false;
    fetchColorByChoices(datasetName, run.patchesField)
      .then((fields) => !stale && setChoices(fields))
      .catch(() => !stale && setChoices([]));
    return () => {
      stale = true;
    };
  }, [datasetName, run, source]);

  useEffect(() => {
    setColors(null);
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

    const apply = ({ values: column, meta: fieldMeta }: ColorResponse) => {
      setColors(
        buildColors(
          column,
          { min: fieldMeta.min ?? null, max: fieldMeta.max ?? null },
          rampId,
        ),
      );
      setValues(column);
      setMeta(fieldMeta);
    };

    const currentSource = sourceRef.current;
    if (currentSource) {
      currentSource
        .resolve(colorField, (partial) => !stale && apply(partial))
        .then((final) => !stale && apply(final))
        .catch((e) => !stale && setError(String(e)))
        .finally(() => !stale && setLoading(false));
      return () => {
        stale = true;
      };
    }

    fetchColor(datasetName, brainKey, colorField)
      .then(({ values: column, meta: fieldMeta }) => {
        if (stale) return;
        setColors(
          buildColors(
            column,
            { min: fieldMeta.min ?? null, max: fieldMeta.max ?? null },
            rampId,
          ),
        );
        setValues(column);
        setMeta(fieldMeta);
      })
      .catch((e) => !stale && setError(String(e)))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, colorField, hasSource, rampId]);

  return { choices, colors, values, meta, loading, error };
}
