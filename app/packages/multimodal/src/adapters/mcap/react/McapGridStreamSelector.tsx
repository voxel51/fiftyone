import { Selector, SelectorValidationError } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import {
  MCAP_GRID_STREAM_AUTO,
  useMcapGridImageTopics,
  useMcapGridSelectedImageTopic,
} from "./mcap-grid-stream-state";

const AUTO_PLACEHOLDER = "Stream: Auto";

const StreamOption = ({ value }: { className?: string; value: string }) => (
  <>{value === MCAP_GRID_STREAM_AUTO ? AUTO_PLACEHOLDER : value}</>
);

/**
 * Grid-header control for choosing the image topic used by MCAP previews.
 */
export function McapGridStreamSelector() {
  const dataset = fos.useCurrentDataset();
  const datasetName = dataset?.name;
  const topics = useMcapGridImageTopics(datasetName);
  const [selectedTopic, setSelectedTopic] =
    useMcapGridSelectedImageTopic(datasetName);

  const options = useMemo(() => [MCAP_GRID_STREAM_AUTO, ...topics], [topics]);
  const useSearch = useCallback(
    (search: string) => {
      const normalizedSearch = search.toLowerCase();
      const values = options.filter((topic) =>
        topic.toLowerCase().includes(normalizedSearch)
      );

      return { total: options.length, values };
    },
    [options]
  );

  return (
    <Selector
      component={StreamOption}
      containerStyle={{
        maxWidth: "16rem",
        minWidth: "7.5rem",
        position: "relative",
      }}
      cy="mcap-grid-stream"
      inputStyle={{ height: 28 }}
      onSelect={async (topic, value) => {
        const nextTopic = value ?? topic;
        if (!options.includes(nextTopic)) {
          throw new SelectorValidationError();
        }

        setSelectedTopic(nextTopic);
        return nextTopic === MCAP_GRID_STREAM_AUTO ? "" : nextTopic;
      }}
      overflow
      placeholder={AUTO_PLACEHOLDER}
      useSearch={useSearch}
      value={selectedTopic === MCAP_GRID_STREAM_AUTO ? "" : selectedTopic}
    />
  );
}
