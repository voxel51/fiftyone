import * as fos from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import { LightningBolt } from "../Sidebar/Entries/FilterablePathEntry/Icon";

const Icon = ({ color, path }: { color?: string; path: string }) => {
  const hasFilters = useReverbValue(fos.hasFilters(false));
  const filteredIndex = useReverbValue(
    fos.pathHasIndexes({ path, withFilters: true }),
  );
  const pathColor = useReverbValue(fos.pathColor(path));

  return (
    <LightningBolt
      color={filteredIndex ? (color ?? pathColor) : undefined}
      tooltip={filteredIndex && hasFilters ? "Compound index" : "Indexed"}
    />
  );
};

export default function useQueryPerformanceIcon(
  modal: boolean,
  named: boolean,
  path: string,
  color?: string,
) {
  const filteredIndex = useReverbValue(
    fos.pathHasIndexes({ path, withFilters: true }),
  );
  const frameField = useReverbValue(fos.isFrameField(path));
  const indexed = useReverbValue(fos.pathHasIndexes({ path }));
  const queryPerformance = useReverbValue(fos.queryPerformance);

  const showQueryPerformanceIcon =
    named &&
    queryPerformance &&
    (indexed || filteredIndex) &&
    !modal &&
    !frameField;

  if (!showQueryPerformanceIcon) {
    return null;
  }

  return <Icon path={path} color={color} />;
}
