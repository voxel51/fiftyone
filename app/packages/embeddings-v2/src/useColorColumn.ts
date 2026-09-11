import { useEffect, useRef, useState } from "react";
import type { ColorColumnSource } from "./extensions";
import {
  fetchColor,
  fetchColorByChoices,
  type ColorMeta,
  type ColorResponse,
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
  /** An extension-owned column source: its choices replace the schema-derived
   * ones and its resolver replaces the server fetch. Leaves the server path
   * untouched when null. */
  source: ColorColumnSource | null = null,
): {
  choices: string[];
  values: ColorValues | null;
  meta: ColorMeta | null;
  /** A column fetch is in flight — the field's first hit aggregates
   * server-side and can take seconds at scale, so hosts show progress */
  loading: boolean;
  /** More CHOICES are still coming (see ColorColumnSource.pending), as
   * opposed to a column being fetched for one of them */
  choicesLoading: boolean;
  error: string | null;
} {
  const [choices, setChoices] = useState<string[]>([]);
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
  // Semantic key, not identity: a recreated-but-equivalent source must not
  // restart resolution, while a source whose answers changed (see
  // ColorColumnSource.revision) must
  const sourceRevision = source?.revision;

  // Color-by field choices depend on the run (patches vs samples)
  useEffect(() => {
    // The previous run's fields must not populate the new run's menu
    setChoices([]);
    const currentSource = sourceRef.current;
    if (currentSource) {
      setChoices(currentSource.choices);
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
    // Through the ref and the semantic key, never the source's identity: an
    // extension recreates its source every render, and setChoices under an
    // identity dependency re-rendered into an infinite loop
  }, [datasetName, run, hasSource, sourceRevision]);

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

    const apply = ({ values: column, meta: fieldMeta }: ColorResponse) => {
      setValues(column);
      setMeta(fieldMeta);
    };

    const currentSource = sourceRef.current;
    if (currentSource) {
      // Releases this hook's interest in the column when the field is
      // superseded or the host unmounts, so a cancellable source can stop
      // working on a color nobody wants anymore
      const interest = new AbortController();
      currentSource
        .resolve(
          colorField,
          (partial) => !stale && apply(partial),
          interest.signal,
        )
        .then((final) => !stale && apply(final))
        .catch((e) => !stale && setError(String(e)))
        .finally(() => !stale && setLoading(false));
      return () => {
        stale = true;
        interest.abort();
      };
    }

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
  }, [datasetName, brainKey, colorField, hasSource, sourceRevision]);

  // Read straight off the source, not held in state: it is a pass-through
  // flag, and mirroring it into state would leave the spinner a render behind
  // the list it describes
  return {
    choices,
    values,
    meta,
    loading,
    choicesLoading: Boolean(source?.pending),
    error,
  };
}
