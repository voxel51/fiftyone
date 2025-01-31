import { usePanelStatePartial } from "@fiftyone/spaces";

export default function Stats() {
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const [augmentedPlot] = usePanelStatePartial("augmentedPlot", null, true);
  return null; // remove this line

  return (
    <div>
      <span>augmentedPlot: {getPointCount(augmentedPlot?.traces)}</span>
      <span style={{ marginLeft: "2rem" }}>
        loadedPlot: {getPointCount(loadedPlot?.traces)}
      </span>
    </div>
  );
}

type SamplePoint = {
  points: [number, number];
  id: string;
  sample_id: string;
};
function getPointCount(traces: { [key: string]: SamplePoint[] }) {
  if (!traces) return 0;
  let count = 0;
  for (const samplePoints of Object.values(traces)) {
    count += samplePoints.length;
  }
  return count;
}
