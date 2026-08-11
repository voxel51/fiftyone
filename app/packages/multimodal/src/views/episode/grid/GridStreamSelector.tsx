import { Selector, SelectorValidationError } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import {
  GRID_STREAM_AUTO,
  useGridSelectedStream,
  useGridStreams,
} from "./grid-stream-state";

const AUTO_PLACEHOLDER = "Stream: Auto";

const StreamOption = ({ value }: { className?: string; value: string }) => (
  <>{value === GRID_STREAM_AUTO ? AUTO_PLACEHOLDER : value}</>
);

/**
 * Grid-header control for choosing the stream used by episode previews.
 */
export function GridStreamSelector() {
  const dataset = fos.useCurrentDataset();
  const datasetName = dataset?.name;
  const streams = useGridStreams(datasetName);
  const [selectedStream, setSelectedStream] =
    useGridSelectedStream(datasetName);

  const options = useMemo(() => [GRID_STREAM_AUTO, ...streams], [streams]);
  const useSearch = useCallback(
    (search: string) => {
      const normalizedSearch = search.toLowerCase();
      const values = options.filter((stream) =>
        stream.toLowerCase().includes(normalizedSearch),
      );

      return { total: options.length, values };
    },
    [options],
  );

  return (
    <Selector
      component={StreamOption}
      containerStyle={{
        maxWidth: "16rem",
        minWidth: "7.5rem",
        position: "relative",
      }}
      cy="episode-grid-stream"
      inputStyle={{ height: 28 }}
      onSelect={(stream, value) => {
        const nextStream = value ?? stream;
        if (!options.includes(nextStream)) {
          return Promise.reject(new SelectorValidationError());
        }

        setSelectedStream(nextStream);
        return Promise.resolve(
          nextStream === GRID_STREAM_AUTO ? "" : nextStream,
        );
      }}
      overflow
      placeholder={AUTO_PLACEHOLDER}
      useSearch={useSearch}
      value={selectedStream === GRID_STREAM_AUTO ? "" : selectedStream}
    />
  );
}
