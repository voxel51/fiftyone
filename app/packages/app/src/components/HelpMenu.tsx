/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The header's help menu: documentation, source and community links, and the
 * theme toggle.
 */

import {
  DarkModeIcon,
  DiscordIcon,
  Dropdown,
  DropdownAnchor,
  GitHubIcon,
  HelpIcon,
  IconAction,
  LightModeIcon,
  MenuBookIcon,
  MenuIconTextItem,
  MenuSeparator,
  Size,
} from "@voxel51/voodo";

const LINKS = [
  {
    label: "Documentation",
    href: "https://docs.voxel51.com/user_guide/app.html",
    Icon: MenuBookIcon,
  },
  {
    label: "GitHub",
    href: "https://github.com/voxel51/fiftyone",
    Icon: GitHubIcon,
  },
  {
    label: "Discord",
    href: "https://community.voxel51.com/",
    Icon: DiscordIcon,
  },
];

export default function HelpMenu({
  theme,
  onToggleTheme,
}: {
  /** The theme in effect; without a toggle the menu holds only links. */
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
}) {
  return (
    <Dropdown
      anchor={DropdownAnchor.BottomEnd}
      trigger={
        <IconAction
          icon={HelpIcon}
          size={Size.Md}
          aria-label="Help"
          title="Help"
          data-cy="header-help"
        />
      }
    >
      {LINKS.map(({ label, href, Icon }) => (
        <MenuIconTextItem
          key={label}
          icon={<Icon size={16} />}
          text={label}
          onClick={() => window.open(href, "_blank", "noopener")}
        />
      ))}
      {onToggleTheme && (
        <>
          <MenuSeparator />
          <MenuIconTextItem
            icon={
              theme === "dark" ? (
                <LightModeIcon size={16} />
              ) : (
                <DarkModeIcon size={16} />
              )
            }
            text={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={onToggleTheme}
            data-cy="header-theme"
          />
        </>
      )}
    </Dropdown>
  );
}
