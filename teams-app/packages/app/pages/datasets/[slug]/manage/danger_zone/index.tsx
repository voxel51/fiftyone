import { Alert, AlertTitle, Grid, Typography, Button } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Layout from "../components/Layout";
import { Box, Container, Dialog, TextInput } from "@fiftyone/teams-components";
import { useState } from "react";
import { useRouter } from "next/router";
import {
  manageDatasetRemoveDatasetMutation,
  UPDATE_DATASET,
  useCurrentDataset,
} from "@fiftyone/teams-state";
import { withPermissions, useMutation } from "@fiftyone/hooks";
// import { DELETE_DATASET_DOCS_LINK } from '@fiftyone/teams-state/src/constants';

function DangerZone() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [removeDataset, removeDatasetInProgress] = useMutation(
    manageDatasetRemoveDatasetMutation
  );
  const {
    query: { slug },
    push,
  } = useRouter();
  const dataset = useCurrentDataset(slug as string);
  const datasetName = dataset?.name;

  return (
    <Layout>
      <Box>
        <Alert severity="error" variant="outlined">
          {/* @ts-ignore */}
          <AlertTitle>Warning: danger zone</AlertTitle>
          <Typography variant="body1">
            Changing these settings will cause permanent catastrophic data loss.
            Proceed with extreme caution.
          </Typography>
        </Alert>
        <Container sx={{ marginTop: 4 }}>
          <Grid container>
            <Grid item container spacing={2}>
              <Grid item xs={4}>
                <Typography>Delete dataset</Typography>
              </Grid>
              <Grid item xs direction="column">
                <Button
                  data-testid="dataset-delete-btn"
                  variant="contained"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => {
                    setOpen(true);
                  }}
                  color="error"
                >
                  Delete entire dataset
                </Button>
                <Typography variant="body1" paddingTop={2}>
                  This will delete your entire dataset.
                  {/* {' '}
                  <Link href={DELETE_DATASET_DOCS_LINK} target="_blank">
                    Learn more about deleting datasets
                  </Link>
                  . */}
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        </Container>
        <Dialog
          data-testid="delete-dataset-dialog"
          title="Permanently delete dataset?"
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          confirmationButtonColor="error"
          confirmationButtonText="Delete dataset"
          disableConfirmationButton={
            value !== datasetName || removeDatasetInProgress
          }
          loading={removeDatasetInProgress}
          onConfirm={() => {
            removeDataset({
              successMessage: "Successfully deleted the dataset",
              errorMessage: "Failed to delete the dataset",
              variables: { identifier: slug },
              onCompleted() {
                setOpen(false);
                push("/datasets");
              },
            });
          }}
        >
          <Box>
            <Typography variant="body1" paddingBottom={2}>
              Are you sure you want to delete this dataset? This cannot be
              undone.
            </Typography>
            <TextInput
              data-testid="delete-dataset-name-input"
              fieldLabel="Type dataset name"
              fullWidth
              size="small"
              placeholder={datasetName}
              onChange={(e) => {
                setValue(e.target.value);
              }}
            />
          </Box>
        </Dialog>
      </Box>
    </Layout>
  );
}

export { getServerSideProps } from "lib/env";

export default withPermissions<{}>(DangerZone, [UPDATE_DATASET], "dataset", {
  getLayoutProps: () => ({
    topNavProps: {
      noBorder: true,
    },
  }),
});
