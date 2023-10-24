import { Dataset } from "@fiftyone/core";
import "@fiftyone/embeddings";
import "@fiftyone/looker-3d";
import "@fiftyone/map";
import { OperatorCore } from "@fiftyone/operators";
import "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { datasetQueryContext } from "@fiftyone/state";
import { NotFoundError } from "@fiftyone/utilities";
import { Snackbar } from "@material-ui/core";
import MuiAlert, { AlertProps } from "@mui/material/Alert";
import React, { useEffect } from "react";
import { usePreloadedQuery } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
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
            idx
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
              idx
              color
            }
            colorscale {
              name
              list
            }
          }
          labelTags {
            fieldColor
            valueColors {
              color
              value
            }
          }
          colorscale {
            name
            list
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

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  props,
  ref
) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

const SNACK_VISIBLE_DURATION = 5000;

const DatasetPage: Route<DatasetPageQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(DatasetPageQueryNode, prepared);
  const isModalActive = Boolean(useRecoilValue(fos.isModalActive));
  const [snackErrors, setSnackErrors] = useRecoilState(fos.snackbarErrors);

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
      <OperatorCore />
      <Nav fragment={data} hasDataset={true} />
      <div className={style.page}>
        <datasetQueryContext.Provider value={data}>
          <Dataset />
        </datasetQueryContext.Provider>
      </div>
      <Snackbar
        open={!!snackErrors.length}
        autoHideDuration={SNACK_VISIBLE_DURATION}
        onClose={() => {
          setSnackErrors([]);
        }}
      >
        <Alert
          onClose={() => {
            setSnackErrors([]);
          }}
          severity="error"
          sx={{ width: "100%" }}
        >
          {snackErrors}
        </Alert>
      </Snackbar>
    </>
  );
};

export default DatasetPage;
