/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Text, TextColor } from "@voxel51/voodo";

import { Layout } from "./Layout";
import { OperatorHint } from "./OperatorHint";
import { ProseLink } from "./Prose";

const CODE = `import fiftyone as fo

# A name for the dataset
name = "my-dataset"

# The directory containing the data to import
dataset_dir = "/path/to/data"

# The type of data being imported
dataset_type = fo.types.COCODetectionDataset

dataset = fo.Dataset.from_dir(
    dataset_dir=dataset_dir,
    dataset_type=dataset_type,
    name=name,
)`;

const LEARN_MORE =
  "https://docs.voxel51.com/user_guide/dataset_creation/index.html";

/** There are no datasets at all. */
export function AddDataset() {
  return (
    <Layout
      code={CODE}
      codeSubtitle={
        <>
          You can use Python to&nbsp;
          <ProseLink href={LEARN_MORE}>load data</ProseLink>
          &nbsp;into FiftyOne
        </>
      }
      codeTitle="Create dataset with code"
      subtitle={
        <>
          <OperatorHint
            clickLabel="create a new dataset"
            installLabel="create datasets"
            pluginLabel="@voxel51/utils"
            pluginLink="https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/utils"
            uri="@voxel51/utils/create_dataset"
          />
          <Text color={TextColor.Secondary}>
            <ProseLink href={LEARN_MORE}>Learn more</ProseLink>
            &nbsp;about loading data into FiftyOne
          </Text>
        </>
      }
      title="No datasets yet"
    />
  );
}
