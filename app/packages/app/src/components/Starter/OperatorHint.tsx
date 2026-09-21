/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useOperatorBrowser,
  usePromptOperatorInput,
} from "@fiftyone/operators";
import { Text, TextColor } from "@voxel51/voodo";
import { useCallback, useMemo } from "react";

import { ProseButton, ProseLink } from "./Prose";

/**
 * How to do the thing in the App: the operator when it is installed, and the
 * plugin that carries it when it is not.
 */
export function OperatorHint({
  clickLabel,
  installLabel,
  pluginLabel,
  pluginLink,
  uri,
}: {
  clickLabel: string;
  installLabel: string;
  pluginLabel: string;
  pluginLink: string;
  uri: string;
}) {
  const browser = useOperatorBrowser();
  const installed = useMemo(
    () =>
      Array.isArray(browser.choices) &&
      browser.choices.some((choice) => choice?.value === uri),
    [browser, uri],
  );

  return (
    <Text color={TextColor.Secondary}>
      {installed ? (
        <>
          <OperatorLauncher uri={uri} />
          to {clickLabel}
        </>
      ) : (
        <>
          Did you know? You can {installLabel} in the App by installing
          the&nbsp;
          <ProseLink href={pluginLink}>{pluginLabel}</ProseLink>
          &nbsp;plugin
        </>
      )}
      , or&nbsp;
      <ProseButton onClick={browser.toggle}>browse operations</ProseButton> for
      other options
    </Text>
  );
}

function OperatorLauncher({ uri }: { uri: string }) {
  const promptForInput = usePromptOperatorInput();

  const launch = useCallback(() => {
    promptForInput(uri);
  }, [promptForInput, uri]);

  return <ProseButton onClick={launch}>Click here</ProseButton>;
}
