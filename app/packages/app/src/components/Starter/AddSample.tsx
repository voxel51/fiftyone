/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCurrentDatasetName } from "@fiftyone/state";
import { Text, TextColor } from "@voxel51/voodo";

import { Layout } from "./Layout";
import { OperatorHint } from "./OperatorHint";
import { ProseLink } from "./Prose";

const code = (dataset: string) => `import fiftyone as fo

dataset = fo.load_dataset("${dataset}")

samples = []
for filepath, label in zip(filepaths, labels):
    sample = fo.Sample(filepath=filepath)
    sample["ground_truth"] = fo.Classification(label=label)
    samples.append(sample)

dataset.add_samples(samples)`;

const LEARN_MORE =
  "https://docs.voxel51.com/user_guide/dataset_creation/index.html#custom-formats";

/** A dataset is open and holds nothing. */
export function AddSample() {
  const dataset = useCurrentDatasetName();

  return (
    <Layout
      code={code(dataset ?? "")}
      codeSubtitle={
        <>
          You can use Python to&nbsp;
          <ProseLink href={LEARN_MORE}>add samples</ProseLink>
          &nbsp;to this dataset
        </>
      }
      codeTitle="Add samples with code"
      subtitle={
        <>
          <OperatorHint
            clickLabel="add samples to this dataset"
            installLabel="add samples to datasets"
            pluginLabel="@voxel51/io"
            pluginLink="https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/io"
            uri="@voxel51/io/import_samples"
          />
          <Text color={TextColor.Secondary}>
            <ProseLink href={LEARN_MORE}>Learn more</ProseLink>
            &nbsp;about loading data into FiftyOne
          </Text>
        </>
      }
      title="No samples yet"
    />
  );
}
