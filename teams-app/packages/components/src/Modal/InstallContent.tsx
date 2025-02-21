import {
  useCurrentOrganization,
  useCurrentUser,
  useEnv,
} from "@fiftyone/hooks";
import { CodeTabs } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import {
  API_CONNECTION,
  PYTHON_START_TEXT,
} from "@fiftyone/teams-state/src/constants";
import { Link, Typography } from "@mui/material";

const {
  FIFTYONE_VERSION_ENV_KEY,
  FIFTYONE_APP_INSTALL_FIFTYONE_OVERRIDE,
  PYPI_INDEX_URL_ENV_KEY,
  FIFTYONE_PACKAGE_NAME_ENV_KEY,
  FIFTYONE_API_URI,
} = CONSTANT_VARIABLES;

interface Props {
  hideInstallLink?: boolean;
}
export default function InstallContent(props: Props) {
  const { hideInstallLink } = props;
  const currentOrganization = useCurrentOrganization();
  const installOverride = useEnv(FIFTYONE_APP_INSTALL_FIFTYONE_OVERRIDE);
  const sdkVersion = useEnv(FIFTYONE_VERSION_ENV_KEY);

  const pypiToken = currentOrganization?.pypiToken || "TOKEN";
  const fiftyonePackageName = useEnv(FIFTYONE_PACKAGE_NAME_ENV_KEY);
  const fiftyone = `${
    fiftyonePackageName ? `${fiftyonePackageName}` : "fiftyone"
  }${sdkVersion ? `==${sdkVersion}` : ""}`;
  const pypiIndexUrl = useEnv(PYPI_INDEX_URL_ENV_KEY);
  const pypiUrl = `${
    pypiIndexUrl ? `${pypiIndexUrl}` : `https://${pypiToken}@pypi.fiftyone.ai`
  }`;

  const INSTALL_FIFTY_ONE_TEXT =
    installOverride ?? `pip install -U --index-url ${pypiUrl} ${fiftyone}`;
  const isGuest = useCurrentUser()?.[0]?.role === "GUEST";
  const uri = useEnv(FIFTYONE_API_URI);
  const INSTALL_FIFTYONE_API_URI = uri ?? "XXXXXXXXX";

  const EXPORT_FIFTYONE_VARIABLES = `export FIFTYONE_API_URI=${INSTALL_FIFTYONE_API_URI}
export FIFTYONE_API_KEY=YYYYYYYYY`;

  if (isGuest) {
    return (
      <Typography variant="body1">
        Guests cannot create API keys or use the Python client.
      </Typography>
    );
  }

  return (
    <>
      <Typography variant="body1">
        Use this command to install the FiftyOne Python client on your local
        machine.
      </Typography>
      <CodeTabs
        tabs={[
          {
            id: "bash-install",
            label: "Bash",
            code: INSTALL_FIFTY_ONE_TEXT,
            customStyle: { overflow: "auto" },
          },
        ]}
      />
      <br />
      <Typography variant="body1">
        Then set these environment variables to{" "}
        <Link href={API_CONNECTION}>configure an API connection</Link>:
      </Typography>
      <CodeTabs
        tabs={[
          {
            id: "bash-install",
            label: "Bash",
            code: EXPORT_FIFTYONE_VARIABLES,
            customStyle: { height: "4rem", overflow: "auto" },
          },
        ]}
      />
      {!Boolean(uri) && (
        <Typography variant="body1" sx={{ mt: 2 }}>
          Please ask your admin for the API URI.
        </Typography>
      )}
      {!hideInstallLink && (
        <Typography variant="body1" sx={{ mt: 2 }}>
          Click <Link href={`/settings/api_keys`}>here</Link> to create an API
          key if necessary.
        </Typography>
      )}
      <Typography variant="body1" sx={{ my: 2 }}>
        Now you're ready to go!
      </Typography>
      <CodeTabs
        tabs={[
          {
            id: "python-start",
            label: "Python",
            code: PYTHON_START_TEXT,
          },
        ]}
      />
    </>
  );
}
