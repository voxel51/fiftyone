import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useState } from "react";

export type OntologyType = "annotation_ontology" | "taxonomy";

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

export const useOntologies = (): UseOntologiesResult => {
  const [ontologies, setOntologies] = useState<OntologySummary[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsFetching(true);
    setError(null);
    getFetchFunction()("GET", "/ontologies?type=annotation_ontology")
      .then((result) =>
        setOntologies((result as OntologiesResponse).ontologies)
      )
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      )
      .finally(() => setIsFetching(false));
  }, []);

  return { ontologies, isFetching, error };
};
