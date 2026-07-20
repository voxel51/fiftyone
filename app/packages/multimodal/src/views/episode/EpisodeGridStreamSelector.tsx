import { Selector, SelectorValidationError } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import {
  EPISODE_GRID_STREAM_AUTO,
  useEpisodeGridSelectedStream,
  useEpisodeGridStreams,
} from "./episode-grid-stream-state";

const AUTO_PLACEHOLDER = "Stream: Auto";

const StreamOption = ({ value }: { className?: string; value: string }) => (
  <>{value === EPISODE_GRID_STREAM_AUTO ? AUTO_PLACEHOLDER : value}</>
);

/**
 * Grid-header control for choosing the stream used by episode previews.
 */
export function EpisodeGridStreamSelector() {
  const dataset = fos.useCurrentDataset();
  const datasetName = dataset?.name;
  const streams = useEpisodeGridStreams(datasetName);
  const [selectedStream, setSelectedStream] =
    useEpisodeGridSelectedStream(datasetName);

  const options = useMemo(
    () => [EPISODE_GRID_STREAM_AUTO, ...streams],
    [streams],
  );
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
      onSelect={async (stream, value) => {
        const nextStream = value ?? stream;
        if (!options.includes(nextStream)) {
          throw new SelectorValidationError();
        }

        setSelectedStream(nextStream);
        return nextStream === EPISODE_GRID_STREAM_AUTO ? "" : nextStream;
      }}
      overflow
      placeholder={AUTO_PLACEHOLDER}
      useSearch={useSearch}
      value={selectedStream === EPISODE_GRID_STREAM_AUTO ? "" : selectedStream}
    />
  );
}
