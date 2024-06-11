import { Dataset, Snackbar, Starter } from "@fiftyone/core";
import "@fiftyone/embeddings";
import "@fiftyone/looker-3d";
import "@fiftyone/map";
import { OperatorCore } from "@fiftyone/operators";
import "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { datasetQueryContext } from "@fiftyone/state";
import React, { useEffect } from "react";
import { usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";
import Nav from "../../components/Nav";
import { Route } from "../../routing";
import style from "../index.module.css";
import { DatasetPageQuery } from "./__generated__/DatasetPageQuery.graphql";

const DatasetPageQueryNode = graphql`
  query DatasetPageQuery(
    $search: String = ""
    $count: Int
    $cursor: String
    $savedViewSlug: String
    $name: String!
    $view: BSONArray!
    $extendedView: BSONArray
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
    ...stageDefinitionsFragment
    ...viewSchemaFragment
  }
`;

const DatasetPage: Route<DatasetPageQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(DatasetPageQueryNode, prepared);
  const isModalActive = Boolean(useRecoilValue(fos.isModalActive));
  const count = useRecoilValue(fos.datasetSampleCount);
  const isEmpty = count === 0;

  useEffect(() => {
    document
      .getElementById("modal")
      ?.classList.toggle("modalon", isModalActive);
  }, [isModalActive]);

  return (
    <>
      <Nav fragment={data} hasDataset={!isEmpty} />
      <div className={style.page} data-cy={"dataset-page"}>
        {isEmpty ? (
          <Starter mode="ADD_SAMPLE" />
        ) : (
          <datasetQueryContext.Provider value={data}>
            <OperatorCore />
            <Dataset />
          </datasetQueryContext.Provider>
        )}
      </div>
      <Snackbar />
    </>
  );
};

export default DatasetPage;
