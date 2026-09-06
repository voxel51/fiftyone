/**
 * Disconnected. One primary action; the URLs are an escape hatch, not a
 * step — most users never open Advanced.
 */

import {
  Align,
  Button,
  Card,
  Clickable,
  Collapsible,
  FormField,
  Heading,
  HeadingLevel,
  Icon,
  IconName,
  Input,
  InputType,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";

import { errorMessage } from "../copy";
import { ConnectionForm } from "../hooks/useConnection";
import { ErrorInfo } from "../types";

export interface ConnectCardProps {
  form: ConnectionForm;
  /** A failed pairing or a rejected key left an explanation behind. */
  error?: ErrorInfo;
  onConnect(): void;
  connecting: boolean;
}

export function ConnectCard(props: ConnectCardProps) {
  const { form, error, onConnect, connecting } = props;

  return (
    <Card>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          <Heading level={HeadingLevel.H3}>Connect to FiftyOne Cloud</Heading>
          <Text color={TextColor.Secondary}>
            Connecting pairs this machine with your cloud account. You approve
            it once, in the browser, and uploads run from here.
          </Text>
        </Stack>

        {error && (
          <Text color={TextColor.Destructive}>{errorMessage(error)}</Text>
        )}

        <Collapsible
          defaultOpen={form.advancedOpenByDefault}
          header={({ open, toggle }) => (
            <Clickable onClick={toggle}>
              <Stack
                orientation={Orientation.Row}
                align={Align.Center}
                spacing={Spacing.Xs}
              >
                <Icon
                  name={open ? IconName.ChevronBottom : IconName.ChevronRight}
                  size={Size.Sm}
                />
                <Text variant={TextVariant.Label}>Advanced</Text>
              </Stack>
            </Clickable>
          )}
        >
          <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
            <FormField
              label="Cloud API URL"
              control={
                <Input
                  value={form.apiUrl}
                  type={InputType.Url}
                  placeholder="https://api.example.com"
                  onChange={(event) => form.setApiUrl(event.target.value)}
                />
              }
            />
            <FormField
              label="Auth URL"
              description="The CAS API base, including its path prefix"
              control={
                <Input
                  value={form.authUrl}
                  type={InputType.Url}
                  placeholder="https://auth.example.com/cas/api"
                  onChange={(event) => form.setAuthUrl(event.target.value)}
                />
              }
            />
          </Stack>
        </Collapsible>

        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
        >
          <Button
            variant={Variant.Primary}
            disabled={!form.canConnect || connecting}
            onClick={onConnect}
          >
            Connect
          </Button>
          {connecting && <Spinner size={Size.Sm} />}
        </Stack>
      </Stack>
    </Card>
  );
}
