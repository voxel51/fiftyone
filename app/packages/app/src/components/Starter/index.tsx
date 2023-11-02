import { CodeTabs } from "@fiftyone/components";
import { OperatorCore, useOperators } from "@fiftyone/operators";
import { useOperatorBrowser } from "@fiftyone/operators/src/state";
import { Button, Divider, Link, Stack, Typography } from "@mui/material";
import React from "react";
import { CONTENT_BY_MODE } from "./content";
import { scrollable } from "@fiftyone/components";

export default function Starter(props: StarterPropsType) {
  const { mode } = props;
  const browser = useOperatorBrowser();
  useOperators(true);

  if (!mode) return null;

  const {
    code,
    codeSubtitle,
    codeTitle,
    learnMoreLabel,
    learnMoreLink,
    subtitle,
    title,
  } = CONTENT_BY_MODE[mode];

  return (
    <>
      <OperatorCore />
      <Stack
        spacing={6}
        divider={<Divider sx={{ width: "100%" }} />}
        sx={{
          fontWeight: "normal",
          alignItems: "center",
          width: "100%",
          py: 8,
          overflow: "auto",
        }}
        className={scrollable}
      >
        <Stack alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: 16 }}>{title}</Typography>
          <Typography color="text.secondary">
            {subtitle}&nbsp;
            <Button
              sx={{
                p: 0,
                textTransform: "none",
                fontSize: "inherit",
                lineHeight: "inherit",
                verticalAlign: "baseline",
                color: (theme) => theme.palette.text.primary,
                textDecoration: "underline",
              }}
              onClick={() => {
                browser.toggle();
              }}
            >
              browse operators
            </Button>
          </Typography>
          <Typography color="text.secondary">
            <Link
              href={learnMoreLink}
              target="_blank"
              sx={{
                textDecoration: "underline",
                ":hover": { textDecoration: "none" },
              }}
            >
              Learn more
            </Link>
            &nbsp;{learnMoreLabel}
          </Typography>
        </Stack>
        <Stack alignItems="center">
          <Typography sx={{ fontSize: 16 }}>{codeTitle}</Typography>
          <Typography sx={{ pb: 2 }} color="text.secondary">
            {codeSubtitle}
          </Typography>
          <CodeTabs tabs={[{ id: "python", label: "Python", code }]} />
        </Stack>
      </Stack>
    </>
  );
}

type StarterPropsType = {
  mode: "SELECT_DATASET" | "ADD_DATASET" | "ADD_SAMPLE";
};
