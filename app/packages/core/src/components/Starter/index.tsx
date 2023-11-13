import { CodeTabs, Loading, scrollable } from "@fiftyone/components";
import { OperatorCore, useOperators } from "@fiftyone/operators";
import {
  useOperatorBrowser,
  useOperatorExecutor,
  usePromptOperatorInput,
} from "@fiftyone/operators/src/state";
import {
  Button,
  ButtonProps,
  Divider,
  Link,
  LinkProps,
  Stack,
  Typography,
} from "@mui/material";
import React, { useCallback, useMemo } from "react";
import { CONTENT_BY_MODE } from "./content";
import { useRecoilValue } from "recoil";
import { datasetName as datasetNameAtom } from "@fiftyone/state";

const CREATE_DATASET_OPERATOR = "@voxel51/utils/create_dataset";
const IMPORT_SAMPLES_OPERATOR = "@voxel51/io/import_samples";
const INSTALL_UTILS_PLUGIN_LINK =
  "https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/utils";
const INSTALL_IO_PLUGIN_LINK =
  "https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/io";
const INSTALL_UTILS_PLUGIN_LABEL = "@voxel51/utils";
const INSTALL_IO_PLUGIN_LABEL = "@voxel51/io";

export default function Starter(props: StarterPropsType) {
  const { mode } = props;
  const ready = useOperators(true);
  const datasetName = useRecoilValue(datasetNameAtom);

  if (!mode) return null;

  if (!ready) return <Loading>Pixelating...</Loading>;

  const { code, codeTitle, learnMoreLabel, learnMoreLink, title } =
    CONTENT_BY_MODE[mode];

  const codeWithDataset = code.replace("$CURRENT_DATASET_NAME", datasetName);
  const isSelectDataset = mode === "SELECT_DATASET";

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
          {isSelectDataset && (
            <Typography color="text.secondary">
              You can use the selector above to open an existing dataset
            </Typography>
          )}
          <StarterSubtitle {...props} />
          {!isSelectDataset && (
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
          )}
        </Stack>
        <Stack alignItems="center">
          <Typography sx={{ fontSize: 16 }}>{codeTitle}</Typography>
          <Typography sx={{ pb: 2 }} color="text.secondary">
            You can use Python to&nbsp;
            {mode === "ADD_DATASET" && (
              <>
                <InvertedUnderlineLink href={learnMoreLink} target="_blank">
                  load data
                </InvertedUnderlineLink>
                &nbsp;into FiftyOne
              </>
            )}
            {isSelectDataset && <>load a dataset in the App</>}
            {mode === "ADD_SAMPLE" && (
              <>
                <InvertedUnderlineLink href={learnMoreLink} target="_blank">
                  add samples
                </InvertedUnderlineLink>
                &nbsp;to this dataset
              </>
            )}
          </Typography>
          <CodeTabs
            tabs={[{ id: "python", label: "Python", code: codeWithDataset }]}
          />
        </Stack>
      </Stack>
    </>
  );
}

export function StarterSubtitle(props: StarterPropsType) {
  const { mode } = props;
  const browser = useOperatorBrowser();
  const isAddSample = mode === "ADD_SAMPLE";

  const hasOperator = useCallback(
    (uri: string) => {
      if (Array.isArray(browser.choices)) {
        return browser.choices.some((choice) => choice?.value === uri);
      }
      return false;
    },
    [browser]
  );
  const hasCreateDatasetOperator = useMemo(() => {
    if (!isAddSample) {
      return hasOperator(CREATE_DATASET_OPERATOR);
    }
    return false;
  }, [isAddSample, hasOperator]);
  const hasImportSamplesOperator = useMemo(() => {
    if (isAddSample) {
      return hasOperator(IMPORT_SAMPLES_OPERATOR);
    }
    return false;
  }, [isAddSample, hasOperator]);
  const hasRequiredOperator = isAddSample
    ? hasImportSamplesOperator
    : hasCreateDatasetOperator;

  const installLink = isAddSample
    ? INSTALL_IO_PLUGIN_LINK
    : INSTALL_UTILS_PLUGIN_LINK;
  const installLabel = isAddSample
    ? INSTALL_IO_PLUGIN_LABEL
    : INSTALL_UTILS_PLUGIN_LABEL;

  const clickActionLabel = isAddSample
    ? "add samples to this dataset"
    : "create a new dataset";
  const installActionLabel = isAddSample
    ? "add samples to datasets"
    : "create datasets";
  const OPERATOR_URI = isAddSample
    ? IMPORT_SAMPLES_OPERATOR
    : CREATE_DATASET_OPERATOR;

  return (
    <Typography color="text.secondary">
      {hasRequiredOperator ? (
        <>
          <OperatorLauncher uri={OPERATOR_URI} />
          to {clickActionLabel}
        </>
      ) : (
        <>
          Did you know? You can {installActionLabel} in the App by installing
          the&nbsp;
          <InvertedUnderlineLink href={installLink} target="_blank">
            {installLabel}
          </InvertedUnderlineLink>
          &nbsp;plugin
        </>
      )}
      , or&nbsp;
      <ButtonLink onClick={browser.toggle}>browse operations</ButtonLink> for
      other options
    </Typography>
  );
}

// todo: generalize and re-use elsewhere
export function OperatorLauncher(props: OperatorLauncherPropsType) {
  const { uri, prompt = true } = props;
  const promptForInput = usePromptOperatorInput();
  const { execute } = useOperatorExecutor(uri);

  const handleClick = useCallback(() => {
    if (prompt) {
      promptForInput(uri);
    } else {
      execute({});
    }
  }, [prompt, promptForInput, uri, execute]);

  return <ButtonLink onClick={handleClick}>Click here</ButtonLink>;
}
// todo: generalize and re-use elsewhere
export function ButtonLink(props: ButtonProps) {
  return (
    <Button
      {...props}
      sx={{
        p: 0,
        textTransform: "none",
        fontSize: "inherit",
        lineHeight: "inherit",
        verticalAlign: "baseline",
        color: (theme) => theme.palette.text.primary,
        textDecoration: "underline",
        ...(props?.sx || {}),
      }}
    />
  );
}

// todo: generalize and re-use elsewhere
export function InvertedUnderlineLink(props: LinkProps) {
  return (
    <Link
      {...props}
      sx={{
        textDecoration: "underline",
        ":hover": { textDecoration: "none" },
        ...(props?.sx || {}),
      }}
    />
  );
}

type StarterPropsType = {
  mode: "SELECT_DATASET" | "ADD_DATASET" | "ADD_SAMPLE";
};

type OperatorLauncherPropsType = {
  uri: string;
  prompt?: boolean;
};
