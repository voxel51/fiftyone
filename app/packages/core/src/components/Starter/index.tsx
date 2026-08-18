import {
  CodeTabs,
  ENTERPRISE_LEARN_MORE_URL,
  EnterpriseUpsellCallout,
  Loading,
  scrollable,
} from "@fiftyone/components";
import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import {
  OperatorCore,
  OperatorPromptTrigger,
  useOperators,
} from "@fiftyone/operators";
import { useOperatorBrowser } from "@fiftyone/operators/src/state";
import { useDatasetName } from "@fiftyone/state";
import { constants } from "@fiftyone/utilities";
import { HoverPopover } from "@fiftyone/video-annotation";
import {
  Button,
  ButtonProps,
  Divider,
  Link,
  LinkProps,
  Stack,
  Typography,
} from "@mui/material";
import {
  Button as VoodoButton,
  Orientation,
  Size,
  Spacing,
  Stack as VoodoStack,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useMemo } from "react";
import { ADD_SAMPLE_CLOUD_CODE, CONTENT_BY_MODE } from "./content";

const CREATE_DATASET_OPERATOR = "@voxel51/utils/create_dataset";
const IMPORT_SAMPLES_OPERATOR = "@voxel51/io/import_samples";
const INSTALL_UTILS_PLUGIN_LINK =
  "https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/utils";
const INSTALL_IO_PLUGIN_LINK =
  "https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/io";
const INSTALL_UTILS_PLUGIN_LABEL = "@voxel51/utils";
const INSTALL_IO_PLUGIN_LABEL = "@voxel51/io";

export function Starter(props: StarterPropsType) {
  const { mode } = props;
  const { isLoading } = useOperators(true);
  const datasetName = useDatasetName();
  const { isEnabled: upgradedImportEnabled } = useFeature({
    feature: FeatureFlag.VFF_UPGRADED_IMPORT,
  });

  if (!mode) return null;

  if (isLoading) return <Loading>Pixelating...</Loading>;

  const { code, codeTitle, learnMoreLabel, learnMoreLink, title } =
    CONTENT_BY_MODE[mode];

  const codeWithDataset = code.replace("$CURRENT_DATASET_NAME", datasetName);
  const cloudCodeWithDataset = constants.IS_APP_MODE_FIFTYONE
    ? `# Importing from a cloud bucket requires FiftyOne Enterprise.\n# Learn more: ${ENTERPRISE_LEARN_MORE_URL}`
    : ADD_SAMPLE_CLOUD_CODE.replace("$CURRENT_DATASET_NAME", datasetName);
  const isSelectDataset = mode === "SELECT_DATASET";
  const showCloudTab = mode === "ADD_SAMPLE" && upgradedImportEnabled;

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
            tabs={[
              { id: "python", label: "Python", code: codeWithDataset },
              ...(showCloudTab
                ? [
                    {
                      id: "cloud",
                      label: "Cloud bucket",
                      code: cloudCodeWithDataset,
                    },
                  ]
                : []),
            ]}
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
  const { isEnabled: upgradedImportEnabled } = useFeature({
    feature: FeatureFlag.VFF_UPGRADED_IMPORT,
  });

  const hasOperator = useCallback(
    (uri: string) => {
      if (Array.isArray(browser.choices)) {
        return browser.choices.some((choice) => choice?.value === uri);
      }
      return false;
    },
    [browser],
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

  if (isAddSample && upgradedImportEnabled && hasRequiredOperator) {
    return (
      <>
        <VoodoStack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <OperatorPromptTrigger
            operatorUri={OPERATOR_URI}
            params={{ import_from: "local" }}
          >
            <VoodoButton variant={Variant.Primary} size={Size.Sm}>
              From local machine
            </VoodoButton>
          </OperatorPromptTrigger>
          {constants.IS_APP_MODE_FIFTYONE ? (
            <HoverPopover
              label="Cloud bucket import is available in FiftyOne Enterprise"
              placement="below"
              content={
                <EnterpriseUpsellCallout
                  title="Import from cloud storage"
                  description="Import samples directly from S3, GCS, Azure, or MinIO buckets in FiftyOne Enterprise."
                />
              }
            >
              <VoodoButton variant={Variant.Primary} size={Size.Sm} disabled>
                From cloud bucket
              </VoodoButton>
            </HoverPopover>
          ) : (
            <OperatorPromptTrigger
              operatorUri={OPERATOR_URI}
              params={{ import_from: "cloud" }}
            >
              <VoodoButton variant={Variant.Primary} size={Size.Sm}>
                From cloud bucket
              </VoodoButton>
            </OperatorPromptTrigger>
          )}
        </VoodoStack>
        <Typography color="text.secondary">
          or&nbsp;
          <ButtonLink onClick={browser.toggle}>browse operations</ButtonLink>
          &nbsp;for other options
        </Typography>
      </>
    );
  }

  return (
    <Typography color="text.secondary">
      {hasRequiredOperator ? (
        <OperatorPromptTrigger operatorUri={OPERATOR_URI}>
          <ButtonLink>Click here</ButtonLink>
        </OperatorPromptTrigger>
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
      {hasRequiredOperator && <>to {clickActionLabel}</>}, or&nbsp;
      <ButtonLink onClick={browser.toggle}>browse operations</ButtonLink> for
      other options
    </Typography>
  );
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
