import { ExternalLink, useTheme } from "@fiftyone/components";
import {
  datasetSampleCount,
  pathHasIndexes,
  queryPerformance,
  queryPerformanceMaxSearch,
} from "@fiftyone/state";
import { Launch } from "@mui/icons-material";
import { useReverbValue } from "@fiftyone/reverb";
import { QUERY_PERFORMANCE_RESULTS } from "../../utils/links";

const IncompleteResults = () => {
  const theme = useTheme();
  return (
    <div style={{ textAlign: "right" }}>
      Incomplete search.{" "}
      <ExternalLink
        style={{ color: theme.text.primary, textDecoration: "underline" }}
        href={QUERY_PERFORMANCE_RESULTS}
      >
        create an index
        <Launch style={{ height: "1rem", marginTop: 4.5, marginLeft: 1 }} />
      </ExternalLink>
    </div>
  );
};

export default function useIncompleteResults(path: string) {
  const count = useReverbValue(datasetSampleCount);
  const max = useReverbValue(queryPerformanceMaxSearch);
  const qp = useReverbValue(queryPerformance);
  const indexed = useReverbValue(pathHasIndexes({ path }));

  if (indexed || !qp || count <= max) {
    return undefined;
  }

  return <IncompleteResults />;
}
