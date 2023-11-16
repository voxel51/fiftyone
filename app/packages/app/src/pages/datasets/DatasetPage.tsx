import { Dataset, Snackbar } from "@fiftyone/core";
import "@fiftyone/embeddings";
import "@fiftyone/looker-3d";
import "@fiftyone/map";
import { OperatorCore } from "@fiftyone/operators";
import "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { datasetQueryContext } from "@fiftyone/state";
import { NotFoundError } from "@fiftyone/utilities";
import React, { useEffect } from "react";
import { usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";
import Nav from "../../components/Nav";
import { Route } from "../../routing";
import style from "../index.module.css";
import { DatasetPageQuery } from "./__generated__/DatasetPageQuery.graphql";
import { Starter } from "@fiftyone/core";

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
      multicolorKeypoints
      showSkeletons
    }

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

  if (!data.dataset?.name) {
    throw new NotFoundError({ path: `/datasets/${prepared.variables.name}` });
  }

  return (
    <>
      <Nav fragment={data} hasDataset={!isEmpty} />
      {isEmpty ? (
        <Starter mode="ADD_SAMPLE" />
      ) : (
        <>
          <OperatorCore />
          <div className={style.page}>
            <datasetQueryContext.Provider value={data}>
              <Dataset />
            </datasetQueryContext.Provider>
          </div>
          <Snackbar />
        </>
      )}
    </>
  );
};

export default DatasetPage;
