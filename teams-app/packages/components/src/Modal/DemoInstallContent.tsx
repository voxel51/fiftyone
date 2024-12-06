import { CodeTabs } from "@fiftyone/components";
import { Box, Link, Stack, Typography } from "@mui/material";
import { useTrackEvent } from "@fiftyone/analytics";
import { useEffect } from "react";

export default function DemoInstallContent() {
  const trackEvent = useTrackEvent();

  useEffect(() => {
    trackEvent("demo_install_content");
  }, []);

  return (
    <Stack>
      <Typography>
        Use this command to install FiftyOne on your local machine:
      </Typography>
      <Box
        sx={{
          div: {
            minWidth: "unset",
          },
        }}
      >
        <CodeTabs
          tabs={[
            { id: "bash-install", label: "Bash", code: INSTALL_FIFTYONE_CODE },
          ]}
        />
      </Box>
      <Typography sx={{ pt: 2 }}>Now you’re ready to go!</Typography>
      <Box
        sx={{
          div: {
            minWidth: "unset",
          },
        }}
      >
        <CodeTabs
          tabs={[
            { id: "python-launch-app", label: "Python", code: LAUNCH_APP_CODE },
          ]}
        />
      </Box>
      <Typography component="span" sx={{ pt: 2 }}>
        Want to try the full version of FiftyOne Teams?&nbsp;
        <Link
          href="https://voxel51.com/book-a-demo/"
          target="_blank"
          onClick={() => {
            trackEvent("click_schedule_demo");
          }}
        >
          Schedule a demo
        </Link>
        <Typography component="span">.</Typography>
      </Typography>
    </Stack>
  );
}

const INSTALL_FIFTYONE_CODE = "pip install fiftyone";
const LAUNCH_APP_CODE = `import fiftyone as fo
import fiftyone.zoo as foz

dataset = foz.load_zoo_dataset("quickstart")
session = fo.launch_app(dataset)`;
