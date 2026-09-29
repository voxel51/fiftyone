/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ActivityToast,
  Dataset,
  EmptyDatasetSelection,
  Modal,
  ModalActionItems,
  ModalModeSwitch,
  DatasetGridRendererFailover,
  QueryPerformanceToast,
  SchemaManagerOutlet,
  Snackbar,
} from "@fiftyone/core";
import "@fiftyone/embeddings-v2";
import "@fiftyone/map";
import { OperatorCore } from "@fiftyone/operators";
import "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { datasetQueryContext } from "@fiftyone/state";
import { usePreloadedQuery } from "react-relay";
import { useReverbValue } from "@fiftyone/reverb";
import { graphql } from "relay-runtime";
import Nav from "../../components/Nav";
import { AddSample } from "../../components/Starter";
import { useProduct } from "../../product";
import SamplePageHeader from "../../samplePage/SamplePageHeader";
import useSamplePage from "../../samplePage/useSamplePage";
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

  const count = useReverbValue(fos.datasetSampleCount);
  const isEmpty = count === 0;
  const { Panels } = useProduct();
  const samplePage = useSamplePage();
  const isModalOpen = useReverbValue(fos.isModalActive);

  const { phase, ref } = samplePage;

  return (
    <datasetQueryContext.Provider value={data}>
      {phase !== "open" && (
        <Nav fragment={data} hasDataset={!isEmpty}>
          <div className={style.page} data-cy={"dataset-page"}>
            <DatasetGridRendererFailover />
            {isEmpty ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                  <AddSample />
                </div>
                <EmptyDatasetSelection />
              </div>
            ) : (
              <>
                <Dataset overlay={false} />
                {Panels && <Panels />}
              </>
            )}
          </div>
        </Nav>
      )}
      {phase !== "grid" && (
        <div
          ref={ref}
          className={style.samplePage}
          style={{ opacity: phase === "opening" ? 0 : 1 }}
          data-cy={"sample-page"}
        >
          {isModalOpen && (
            <Modal
              page
              header={
                <SamplePageHeader
                  actions={<ModalActionItems />}
                  mode={<ModalModeSwitch />}
                />
              }
            />
          )}
        </div>
      )}
      {/* Outside the isEmpty branch so `?schemaManager=open` works on an empty
          dataset, and outside the grid so the sample page can open it too. */}
      <SchemaManagerOutlet />
      {!isEmpty && <OperatorCore />}
      <Snackbar />
      <QueryPerformanceToast />
      <ActivityToast />
    </datasetQueryContext.Provider>
  );
};

export default DatasetPage;
