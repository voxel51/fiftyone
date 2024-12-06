import { BasicFormState } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import ConnectAmazonAWS from "./components/ConnectAmazonAWS";
import ConnectAzure from "./components/ConnectAzure";
import ConnectGoogleCloud from "./components/ConnectGoogleCloud";
import ConnectMinIO from "./components/ConnectMinIO";
import { Stack, Typography } from "@mui/material";

const { CLOUD_STORAGE_PROVIDERS, CLOUD_STORAGE_TEXT } = CONSTANT_VARIABLES;

export const COMMON_FIELDS = [
  {
    type: "text",
    label: "Buckets (optional)",
    description: (
      <Stack spacing={2} color="text.secondary">
        <Typography variant="body1">
          You can optionally provide a comma-separated list of bucket names that
          these credentials should apply to. You can include &lsquo; * &rsquo;
          or &lsquo; ? &rsquo; glob wildcards and may also use prefixes like
          &lsquo; s3://my-bucket &rsquo;
        </Typography>

        <Typography sx={{ display: "inline" }} variant="body1">
          {CLOUD_STORAGE_TEXT.subTitlePrefix}
          <Typography
            fontWeight={370}
            variant="subtitle2"
            sx={{ display: "inline" }}
          >
            default credentials
          </Typography>
          {CLOUD_STORAGE_TEXT.subTitleSuffix}
        </Typography>
      </Stack>
    ),
    id: "prefixes",
    fieldProps: {
      placeholder: "my-bucket,my-other-bucket",
    },
  },
  {
    type: "text",
    label: "Description (optional)",
    id: "description",
    fieldProps: {
      multiline: true,
      rows: 3,
    },
  },
];

export const contentByProvider = {
  GCP: {
    Component: ConnectGoogleCloud,
    title: `Connect to ${CLOUD_STORAGE_PROVIDERS.GCP.label}`,
  },
  AWS: {
    Component: ConnectAmazonAWS,
    title: `Connect to ${CLOUD_STORAGE_PROVIDERS.AWS.label}`,
  },
  MINIO: {
    Component: ConnectMinIO,
    title: `Connect to ${CLOUD_STORAGE_PROVIDERS.MINIO.label}`,
  },
  AZURE: {
    Component: ConnectAzure,
    title: `Connect to ${CLOUD_STORAGE_PROVIDERS.AZURE.label}`,
  },
};

export function readTextFile(file: File) {
  return new Promise((resolve) => {
    const fileReader = new FileReader();
    fileReader.onload = (e) => resolve(e.target?.result);
    fileReader.readAsText(file);
  });
}

export type ConnectCloudStorageProps = {
  onChange: (formState: BasicFormState) => void;
};

export default function Page() {
  return null;
}
