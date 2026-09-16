/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What a dataset-less App offers: how to get one, and the Python to do it.
 */

import { OperatorCore, useOperators } from "@fiftyone/operators";
import {
  useOperatorBrowser,
  useOperatorExecutor,
  usePromptOperatorInput,
} from "@fiftyone/operators/src/state";
import { useCurrentDatasetName } from "@fiftyone/state";
import {
  Align,
  Divider,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { PropsWithChildren } from "react";
import { useCallback, useMemo } from "react";

import styles from "./Starter.module.css";
import CodeBlock from "../CodeBlock";
import LoadingScreen from "../LoadingScreen";
import { CONTENT_BY_MODE } from "./content";

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
  const datasetName = useCurrentDatasetName();

  if (!mode) return null;

  if (isLoading) return <LoadingScreen />;

  const { code, codeTitle, learnMoreLabel, learnMoreLink, title } =
    CONTENT_BY_MODE[mode];

  const codeWithDataset = code.replace(
    "$CURRENT_DATASET_NAME",
    datasetName ?? "",
  );
  const isSelectDataset = mode === "SELECT_DATASET";

  return (
    <>
      <OperatorCore />
      <Stack
        orientation={Orientation.Column}
        align={Align.Center}
        spacing={Spacing.Xl}
        className={styles.page}
      >
        <Stack
          orientation={Orientation.Column}
          align={Align.Center}
          spacing={Spacing.Xs}
        >
          <Text variant={TextVariant.Lg}>{title}</Text>
          {isSelectDataset && (
            <Text color={TextColor.Secondary}>
              You can use the selector above to open an existing dataset
            </Text>
          )}
          <StarterSubtitle {...props} />
          {!isSelectDataset && (
            <Text color={TextColor.Secondary}>
              <ProseLink href={learnMoreLink}>Learn more</ProseLink>
              &nbsp;{learnMoreLabel}
            </Text>
          )}
        </Stack>
        <Divider className={styles.divider} />
        <Stack
          orientation={Orientation.Column}
          align={Align.Center}
          spacing={Spacing.Xs}
          className={styles.codeSection}
        >
          <Text variant={TextVariant.Lg}>{codeTitle}</Text>
          <Text color={TextColor.Secondary} className={styles.codeSubtitle}>
            You can use Python to&nbsp;
            {mode === "ADD_DATASET" && (
              <>
                <ProseLink href={learnMoreLink}>load data</ProseLink>
                &nbsp;into FiftyOne
              </>
            )}
            {isSelectDataset && <>load a dataset in the App</>}
            {mode === "ADD_SAMPLE" && (
              <>
                <ProseLink href={learnMoreLink}>add samples</ProseLink>
                &nbsp;to this dataset
              </>
            )}
          </Text>
          <CodeBlock code={codeWithDataset} />
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

  return (
    <Text color={TextColor.Secondary}>
      {hasRequiredOperator ? (
        <>
          <OperatorLauncher uri={OPERATOR_URI} />
          to {clickActionLabel}
        </>
      ) : (
        <>
          Did you know? You can {installActionLabel} in the App by installing
          the&nbsp;
          <ProseLink href={installLink}>{installLabel}</ProseLink>
          &nbsp;plugin
        </>
      )}
      , or&nbsp;
      <ProseButton onClick={browser.toggle}>browse operations</ProseButton> for
      other options
    </Text>
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

  return <ProseButton onClick={handleClick}>Click here</ProseButton>;
}

/** A link inside a sentence: underlined, losing the rule on hover. */
function ProseLink({ children, href }: PropsWithChildren<{ href: string }>) {
  return (
    <a
      className={styles.proseLink}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

/** Reads as a link inside a sentence, acts as a button. */
function ProseButton({
  children,
  onClick,
}: PropsWithChildren<{ onClick: () => void }>) {
  return (
    <button className={styles.proseButton} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

type StarterPropsType = {
  mode: "SELECT_DATASET" | "ADD_DATASET" | "ADD_SAMPLE";
};

type OperatorLauncherPropsType = {
  uri: string;
  prompt?: boolean;
};
