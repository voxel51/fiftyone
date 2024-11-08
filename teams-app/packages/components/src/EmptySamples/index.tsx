import { CodeTabs } from "@fiftyone/teams-components";
import { Divider, Link, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import NextLink from "next/link";
import { ComponentType } from "react";
// const { DATASET_CREATION_DOCUMENTATION_LINK } = CONSTANT_VARIABLES;

type EmptySamplesProps = {
  datasetName: string;
  organizationDisplayName: string;
  canEdit: boolean;
  canInvite: boolean;
  slug: string;
  OperatorComponent?: ComponentType<StarterPropsType>;
};

export default function EmptySamples(props: EmptySamplesProps) {
  const {
    datasetName,
    organizationDisplayName,
    canEdit,
    canInvite,
    slug,
    OperatorComponent,
  } = props;
  const theme = useTheme();

  const addSamplesToDatasetSnippet = `import fiftyone as fo

# A cloud bucket containing the media
data_path = "s3://bucket/path"

# The corresponding labels (local or cloud)
labels_path = "/path/to/labels.json"

# The type of data being imported
dataset_type = fo.types.COCODetectionDataset

dataset = fo.load_dataset("${datasetName}")

dataset.add_dir(
    data_path=data_path,
    labels_path=labels_path,
    dataset_type=dataset_type,
)`;

  return (
    <Stack
      divider={<Divider sx={{ width: "100%" }} />}
      sx={{ alignItems: "center", py: 4 }}
      spacing={4}
    >
      <Stack alignItems="center" spacing={1} pb={4}>
        <Typography variant="h6">No samples yet</Typography>
        {canEdit && (
          <Typography color={theme.palette.text.secondary}>
            {`Add samples to this dataset to start filtering,
                tagging, and sharing`}
          </Typography>
        )}
        {OperatorComponent && <OperatorComponent mode="ADD_SAMPLE" />}
        {canInvite && (
          <Typography>
            Want to invite other people?{" "}
            <NextLink href={`/datasets/${slug}/manage/access`} passHref>
              <Link>Manage access</Link>
            </NextLink>
          </Typography>
        )}
      </Stack>
      {canEdit && (
        <Stack alignItems="center" spacing={1}>
          <Typography variant="h6" color={theme.palette.text.primary}>
            Add samples with code
          </Typography>
          <Typography color={theme.palette.text.secondary} sx={{ pb: 2 }}>
            {`Use Python or command line tools to upload your samples
                to the ${organizationDisplayName} cloud.`}
            {/*  Need help getting started? <Link href={DATASET_CREATION_DOCUMENTATION_LINK}>
                  Read the docs on adding and managing samples.
                </Link> */}
            {/* <a href={DATASET_CREATION_DOCUMENTATION_LINK}>
                  <Typography
                    variant="body1"
                    sx={{
                      lineHeight: 2,
                      width: '100%'
                    }}
                    width="100%"
                    display="inline"
                  >
                    Read the docs on adding and managing samples.
                  </Typography>
                </a> */}
          </Typography>
          <CodeTabs
            tabs={[
              {
                id: "python-add",
                label: "Python",
                code: addSamplesToDatasetSnippet,
              },
            ]}
          />
        </Stack>
      )}
    </Stack>
  );
}

// todo: re-use from oss (not yet exported)
type StarterPropsType = {
  mode: "SELECT_DATASET" | "ADD_DATASET" | "ADD_SAMPLE";
};
