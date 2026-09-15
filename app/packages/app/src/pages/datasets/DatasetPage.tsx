/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ActivityToast,
  Dataset,
  EmptyDatasetSelection,
  DatasetGridRendererFailover,
  QueryPerformanceToast,
  SchemaManagerOutlet,
  SubsetActionRegistration,
  Snackbar,
  Starter,
} from "@fiftyone/core";
import "@fiftyone/embeddings-v2";
import "@fiftyone/map";
import { OperatorCore } from "@fiftyone/operators";
import "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { datasetQueryContext } from "@fiftyone/state";
import { usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";
import Nav from "../../components/Nav";
import type { Route } from "../../routing";
import style from "../index.module.css";
import type { DatasetPageQuery } from "./__generated__/DatasetPageQuery.graphql";

const DatasetPageQueryNode = graphql`
  query DatasetPageQuery(
    $count: Int
    $cursor: String
    $name: String!
    $extendedView: BSONArray!
    $savedViewSlug: String
    $search: String = ""
    $view: BSONArray!
  ) {
    config {
      colorBy
      colorPool
      colorscale
      multicolorKeypoints
      showSkeletons
    }
    colorscale
    dataset(name: $name, view: $extendedView, savedViewSlug: $savedViewSlug) {
      name
      defaultGroupSlice
      appConfig {
        colorScheme {
          id
          colorBy
          colorPool
          multicolorKeypoints
          opacity
          showSkeletons
          defaultMaskTargetsColors {
            intTarget
            color
          }
          defaultColorscale {
            name
            list {
              value
              color
            }
            rgb
          }
          colorscales {
            path
            name
            list {
              value
              color
            }
            rgb
          }
          fields {
            colorByAttribute
            fieldColor
            path
            valueColors {
              color
              value
            }
            maskTargetsColors {
              intTarget
              color
            }
          }
          labelTags {
            fieldColor
            valueColors {
              color
              value
            }
          }
        }
      }
      ...datasetFragment
    }
    ...NavFragment
    ...savedViewsFragment
    ...configFragment
    ...expressionCatalogFragment
    ...stageDefinitionsFragment
    ...viewSchemaFragment
  }
`;

const DatasetPage: Route<DatasetPageQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(DatasetPageQueryNode, prepared);

  const count = useRecoilValue(fos.datasetSampleCount);
  const isEmpty = count === 0;

  return (
    <Nav fragment={data} hasDataset={!isEmpty}>
      <div className={style.page} data-cy={"dataset-page"}>
        <DatasetGridRendererFailover />
        {/* Rendered outside the isEmpty branch so the schema manager URL
            entry point (`?schemaManager=open`) works even on freshly-created
            empty datasets, where defining a schema before adding samples is
            a legitimate first-step workflow. SchemaManagerOutlet doesn't
            depend on `datasetQueryContext.Provider`. */}
        <SchemaManagerOutlet />
        <SubsetActionRegistration />
        {isEmpty ? (
          <div
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
          >
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <Starter mode="ADD_SAMPLE" />
            </div>
            <EmptyDatasetSelection />
          </div>
        ) : (
          <datasetQueryContext.Provider value={data}>
            <OperatorCore />
            <Dataset />
          </datasetQueryContext.Provider>
        )}
      </div>
      <Snackbar />
      <QueryPerformanceToast />
      <ActivityToast />
    </Nav>
  );
};

export default DatasetPage;
