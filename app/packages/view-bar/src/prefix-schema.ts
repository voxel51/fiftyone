/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The schema a stage edits against.
 *
 * A stage reads the view the stages BEFORE it produce, not the view it is part
 * of: `ToPatches("ground_truth")` names a label field of the root dataset, and
 * resolving it against the patches view it generates offers the wrong fields —
 * which is how a stage applied from the grid came to open with an empty picker.
 * The applied view's schema is only correct for the stage being appended.
 */

import * as foq from "@fiftyone/relay";
import type { FieldType } from "@fiftyone/state";
import { useEffect, useRef, useState } from "react";
import { fetchQuery, useRelayEnvironment } from "react-relay";

import type { SerializedStage } from "./state";

export interface PrefixSchema {
  paths: readonly string[];
  types: ReadonlyMap<string, FieldType>;
}

type Served = foq.viewBarSchemaQuery$data["schemaForViewStages"];

const fromServed = (served: Served): PrefixSchema => {
  const types = new Map<string, FieldType>();

  for (const field of served.fieldSchema) {
    types.set(field.path, {
      ftype: field.ftype,
      subfield: field.subfield ?? null,
      embeddedDocType: field.embeddedDocType ?? null,
      frame: false,
    });
  }
  // Frame-level fields are addressed as `frames.<path>`, matching
  // `fos.useFieldTypes`
  for (const field of served.frameFieldSchema) {
    types.set(`frames.${field.path}`, {
      ftype: field.ftype,
      subfield: field.subfield ?? null,
      embeddedDocType: field.embeddedDocType ?? null,
      frame: true,
    });
  }

  return { paths: [...types.keys()], types };
};

/**
 * The schema of `prefix` applied to the dataset, or `null` while it loads (or
 * when there is nothing to resolve). `null` reads as "use the applied view's
 * schema" — stale-but-plausible beats empty while the round-trip is in flight.
 */
export const usePrefixSchema = (
  datasetName: string | null,
  prefix: readonly SerializedStage[] | null,
): PrefixSchema | null => {
  const environment = useRelayEnvironment();
  const [schema, setSchema] = useState<PrefixSchema | null>(null);
  const cache = useRef(new Map<string, PrefixSchema>());

  // The dataset owns the cache — same prefix, different dataset, new schema
  useEffect(() => {
    cache.current.clear();
  }, [datasetName]);

  const key = prefix === null ? null : JSON.stringify(prefix);

  useEffect(() => {
    if (key === null || !datasetName) {
      setSchema(null);
      return undefined;
    }

    const cached = cache.current.get(key);
    if (cached) {
      setSchema(cached);
      return undefined;
    }

    setSchema(null);
    const subscription = fetchQuery<foq.viewBarSchemaQuery>(
      environment,
      foq.viewBarSchema,
      { name: datasetName, view: JSON.parse(key) },
    ).subscribe({
      next: (data) => {
        const resolved = fromServed(data.schemaForViewStages);
        cache.current.set(key, resolved);
        setSchema(resolved);
      },
      // A failed resolve keeps the applied-view fallback
      error: () => setSchema(null),
    });

    return () => subscription.unsubscribe();
  }, [environment, datasetName, key]);

  return schema;
};
