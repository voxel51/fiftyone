/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Text, TextColor } from "@voxel51/voodo";

import { Layout } from "./Layout";
import { OperatorHint } from "./OperatorHint";

const CODE = `import fiftyone as fo

# Name of an existing dataset
name = "quickstart"

dataset = fo.load_dataset(name)

# Launch a new App session
session = fo.launch_app(dataset)

# If you already have an active App session
# session.dataset = dataset`;

/** Datasets exist, and none of them is open. */
export function SelectDataset() {
  return (
    <Layout
      code={CODE}
      codeSubtitle="You can use Python to load a dataset in the App"
      codeTitle="Select a dataset with code"
      subtitle={
        <>
          <Text color={TextColor.Secondary}>
            You can use the selector above to open an existing dataset
          </Text>
          <OperatorHint
            clickLabel="create a new dataset"
            installLabel="create datasets"
            pluginLabel="@voxel51/utils"
            pluginLink="https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/utils"
            uri="@voxel51/utils/create_dataset"
          />
        </>
      }
      title="No dataset selected"
    />
  );
}
