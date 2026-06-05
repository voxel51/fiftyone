import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useState } from "react";

export const ONTOLOGY_TYPE = {
  ontology: "annotation_ontology",
  taxonomy: "taxonomy",
} as const;

export type OntologyType = typeof ONTOLOGY_TYPE[keyof typeof ONTOLOGY_TYPE];

export interface OntologySummary {
  name: string;
  type: OntologyType;
  version: number;
  last_modified_at: string;
}

interface OntologiesResponse {
  ontologies: OntologySummary[];
}

export interface UseOntologiesResult {
  ontologies: OntologySummary[] | null;
  isFetching: boolean;
  error: string | null;
}

export const useOntologies = (type?: OntologyType): UseOntologiesResult => {
  const [ontologies, setOntologies] = useState<OntologySummary[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsFetching(true);
    setError(null);
    const path = type ? `/ontologies?type=${type}` : "/ontologies";
    getFetchFunction()("GET", path)
      .then((result) => {
        if (!cancelled)
          setOntologies((result as OntologiesResponse).ontologies);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  return { ontologies, isFetching, error };
};
