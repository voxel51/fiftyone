/**
 * Copyright 2017-2022, Voxel51, Inc.
 */
import { Theme } from "@fiftyone/components";
import { Dataset as CoreDataset, useLoadedDataset } from "@fiftyone/core";
import {useRecoilValue} from 'recoil'
import * as fos from '@fiftyone/state'
import { darkTheme } from "@fiftyone/utilities";

export function Dataset() {
  const initialState = {
    colorscale: {},
    config: {},
    state: {}
  }
  const dataset = useLoadedDataset(initialState)
  if (!dataset) {
    return <h3>No dataset...</h3>
    throw new Error('Dataset not found')
  }
  const name = useRecoilValue(fos.datasetName);
  if (!name || name !== dataset.name) {
    return null;
  }

  return (
    <Theme theme={darkTheme}>
      <CoreDataset />
    </Theme>
  )
}
