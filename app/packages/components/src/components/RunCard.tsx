import {
  Align,
  Button,
  Card,
  Dropdown,
  Justify,
  LayersIcon,
  MenuIconTextItem,
  MoreVertIcon,
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
import { useState, type CSSProperties, type ReactNode } from "react";

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  border: 0,
};

export interface RunCardAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  hidden?: boolean;
}

export interface RunCardProps {
  /** A function receives whether the card is hovered, for hover-only affordances */
  title: ReactNode | ((hovering: boolean) => ReactNode);
  /** Defaults to the layers icon */
  icon?: ReactNode;
  status?: { label: string; color: TextColor | StatusColor };
  /** A line under the title; `failure` tone renders it as an error */
  message?: { text: ReactNode; tone?: "default" | "failure" };
  /** Kebab menu items; the menu is hidden when none are visible */
  actions?: RunCardAction[];
  /** Makes the card clickable; omit for a status-only card */
  onOpen?: () => void;
  /** Accessible name of the open control; defaults to a string title */
  openLabel?: string;
}

export default function RunCard({
  title,
  icon = <LayersIcon size={Size.Lg} />,
  status,
  message,
  actions = [],
  onOpen,
  openLabel,
}: RunCardProps) {
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const visibleActions = actions.filter((action) => !action.hidden);
  const titleNode = typeof title === "function" ? title(hovering) : title;

  return (
    <Card
      background="secondary"
      onClick={onOpen}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: "relative",
        cursor: onOpen ? "pointer" : "default",
        outline: focused ? "2px solid currentColor" : undefined,
      }}
    >
      {onOpen && (
        <button
          type="button"
          style={VISUALLY_HIDDEN}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          {openLabel ?? (typeof title === "string" ? title : "Open")}
        </button>
      )}
      <Stack
        align={Align.Center}
        justify={Justify.Between}
        spacing={Spacing.Md}
      >
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Stack align={Align.Center} spacing={Spacing.Sm}>
            {icon}
            {typeof titleNode === "string" ? (
              <Text variant={TextVariant.Lg} color={TextColor.Foreground}>
                {titleNode}
              </Text>
            ) : (
              titleNode
            )}
          </Stack>
          {message && (
            <Text
              variant={TextVariant.Md}
              color={
                message.tone === "failure"
                  ? TextColor.Failure
                  : TextColor.Secondary
              }
            >
              {message.text}
            </Text>
          )}
        </Stack>
        <Stack
          align={Align.Center}
          spacing={Spacing.Sm}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {status && (
            <Pill size={Size.Md} isStatus color={status.color as TextColor}>
              {status.label}
            </Pill>
          )}
          {visibleActions.length > 0 && (
            <Dropdown
              anchor="bottom end"
              trigger={
                <Button
                  aria-label="Run actions"
                  size={Size.Sm}
                  variant={Variant.Icon}
                  leadingIcon={MoreVertIcon}
                />
              }
            >
              {visibleActions.map(
                ({ id, label, icon, onClick, disabled, destructive }) => (
                  <MenuIconTextItem
                    key={id}
                    icon={icon}
                    text={label}
                    disabled={disabled}
                    destructive={destructive}
                    onClick={onClick}
                  />
                ),
              )}
            </Dropdown>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
