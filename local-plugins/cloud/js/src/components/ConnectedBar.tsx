/**
 * Connected. A single quiet row — where you are connected, until when, and
 * how to stop.
 */

import {
  Align,
  Button,
  Justify,
  Orientation,
  Pill,
  Size,
  Spacing,
  Stack,
  StatusColor,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";

import { formatKeyExpiry } from "../copy";
import { ConnectionData } from "../types";

export interface ConnectedBarProps {
  connection: ConnectionData;
  onDisconnect(): void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function ConnectedBar(props: ConnectedBarProps) {
  const { connection, onDisconnect } = props;
  const expiry = formatKeyExpiry(connection.key_expires_at);

  return (
    <Stack
      orientation={Orientation.Row}
      justify={Justify.Between}
      align={Align.Center}
      spacing={Spacing.Sm}
    >
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
      >
        <Pill isStatus backgroundColor={StatusColor.Approved}>
          {`Connected · ${hostOf(connection.api_url)}`}
        </Pill>
        {expiry && (
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            {expiry}
          </Text>
        )}
      </Stack>

      {/*
        Dropping the key keeps the URLs, so reconnecting is one click — this
        is not "forget this deployment".
      */}
      <Button
        variant={Variant.Borderless}
        size={Size.Sm}
        onClick={onDisconnect}
      >
        Disconnect
      </Button>
    </Stack>
  );
}
