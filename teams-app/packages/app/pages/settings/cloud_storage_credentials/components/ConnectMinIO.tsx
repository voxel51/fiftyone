import { BasicForm, Box, RoundedTabs } from "@fiftyone/teams-components";
import { HOW_TO_CONNECT_TO_MINIO_LINK } from "@fiftyone/teams-state/src/constants";
import { Link, Typography } from "@mui/material";
import { useState } from "react";
import { COMMON_FIELDS, ConnectCloudStorageProps } from "../utils";

export default function ConnectMinIO({ onChange }: ConnectCloudStorageProps) {
  const [tab, setTab] = useState("ini");

  return (
    <Box>
      <Typography variant="body1" sx={{ mb: 3 }}>
        FiftyOne can connect to MinIO using one of the two methods below.
        Learn&nbsp;
        <Link href={HOW_TO_CONNECT_TO_MINIO_LINK} sx={{ fontWeight: 600 }}>
          how to connect to MinIO
        </Link>
        &nbsp;in our docs.
      </Typography>
      <RoundedTabs
        tabs={[
          { label: "INI file", id: "ini" },
          { label: "Access keys", id: "keys" },
        ]}
        onChange={setTab}
        selected={tab}
      />
      <Box pt={2}>
        {tab === "ini" && (
          <BasicForm
            fields={[
              {
                type: "file",
                id: "ini-file",
                fieldProps: { caption: ".ini file only", types: ".ini" },
                required: true,
              },
              ...COMMON_FIELDS,
            ]}
            onChange={onChange}
          />
        )}
        {tab === "keys" && (
          <BasicForm
            fields={[
              {
                type: "secret",
                label: "Access key id",
                id: "access-key-id",
                fieldProps: { placeholder: "Access key id" },
                required: true,
              },
              {
                type: "secret",
                label: "Secret access key",
                id: "secret-access-key",
                fieldProps: { placeholder: "Secret access key" },
                required: true,
              },
              {
                type: "text",
                label: "Endpoint URL",
                id: "endpoint-url",
                fieldProps: { placeholder: "https://your.url/goes/here" },
                required: true,
              },
              {
                type: "text",
                label: "Alias (optional)",
                id: "alias",
                fieldProps: { placeholder: "My alias" },
              },
              {
                type: "text",
                label: "Default region",
                id: "default-region",
                fieldProps: { placeholder: "us-east-1" },
                required: true,
              },
              ...COMMON_FIELDS,
            ]}
            onChange={onChange}
          />
        )}
      </Box>
    </Box>
  );
}
