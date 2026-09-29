import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useMutation } from "react-relay";
import {
  useReverbCallback,
  useReverbState,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";

/**
 *
 * @param mergedSchema is dataset schema
 * @returns
 */
export default function useSearchSchemaFields(mergedSchema: {
  [key: string]: object;
}) {
  const dataset = useReverbValue(fos.dataset);
  const datasetName = dataset?.name;

  const setExcludedPaths = useSetReverbState(fos.excludedPathsState({}));

  const [searchMetaFilter, setSearchMetaFilter] = useReverbState(
    fos.searchMetaFilterState,
  );

  const searchResults = useReverbValue(fos.schemaSearchResultList);
  const setSearchResults = useReverbCallback(
    ({ set }) =>
      async (newPaths: string[] = []) => {
        set(fos.schemaSearchResultList, newPaths);
      },
    [],
  );

  const [searchSchemaFieldsRaw] = useMutation<foq.searchSelectFieldsMutation>(
    foq.searchSelectFields,
  );

  const searchSchemaFields = useCallback(
    (object) => {
      if (!mergedSchema) {
        return;
      }
      searchSchemaFieldsRaw({
        variables: { datasetName, metaFilter: object },
        onCompleted: (data) => {
          if (data) {
            const { searchSelectFields = [] } = data;
            const res = (searchSelectFields as string[])
              .map((p) => p.replace("._cls", ""))
              .filter((pp) => !pp.startsWith("_"));
            setSearchResults(res);
            setSearchMetaFilter(object);

            const shouldExcludePaths = Object.keys(mergedSchema)
              .filter((path) => !searchSelectFields?.includes(path))
              .filter((path) => {
                const childPathsInSearchResults = searchSelectFields.filter(
                  (pp) => pp.startsWith(`${path}.`),
                );
                return !childPathsInSearchResults.length;
              });
            setExcludedPaths({ [datasetName]: shouldExcludePaths });
          }
        },
        onError: (e) => {
          console.error("failed to search schema fields", e);
        },
      });
    },
    [
      datasetName,
      mergedSchema,
      searchSchemaFieldsRaw,
      setExcludedPaths,
      setSearchMetaFilter,
      setSearchResults,
    ],
  );

  return {
    searchMetaFilter,
    setSearchMetaFilter,
    searchSchemaFields,
    searchResults,
    setSearchResults,
  };
}
