import { BasicForm, Box } from "@fiftyone/teams-components";
import { HOW_TO_CONNECT_TO_GCP_LINK } from "@fiftyone/teams-state/src/constants";
import { Link, Typography } from "@mui/material";
import { COMMON_FIELDS, ConnectCloudStorageProps } from "../utils";

export default function ConnectGoogleCloud({
  onChange,
}: ConnectCloudStorageProps) {
  return (
    <Box>
      <Typography variant="body1" sx={{ mb: 3 }}>
        FiftyOne connects to your GCP instance using credentials you provide
        below. Learn&nbsp;
        <Link href={HOW_TO_CONNECT_TO_GCP_LINK} sx={{ fontWeight: 600 }}>
          how to connect to GCP
        </Link>
        &nbsp;in our docs.
      </Typography>
      <BasicForm
        fields={[
          {
            type: "file",
            id: "service-account-file",
            label: "Credentials file",
            fieldProps: {
              caption: ".json file only",
              types: ".json",
            },
            required: true,
          },
          ...COMMON_FIELDS,
        ]}
        onChange={onChange}
      />
    </Box>
  );
}
