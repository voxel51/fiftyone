/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The community, source and documentation links every header carries.
 */

import {
  Button,
  DiscordIcon,
  GitHubIcon,
  MenuBookIcon,
  Size,
  Variant,
} from "@voxel51/voodo";

const LINKS = [
  {
    label: "Discord",
    href: "https://community.voxel51.com/",
    icon: DiscordIcon,
  },
  {
    label: "GitHub",
    href: "https://github.com/voxel51/fiftyone",
    icon: GitHubIcon,
  },
  {
    label: "Documentation",
    href: "https://docs.voxel51.com/user_guide/app.html",
    icon: MenuBookIcon,
  },
];

export default function HeaderLinks() {
  return (
    <>
      {LINKS.map(({ label, href, icon }) => (
        <Button
          key={label}
          variant={Variant.Icon}
          size={Size.Md}
          borderless
          leadingIcon={icon}
          href={href}
          target="_blank"
          title={label}
          aria-label={label}
        />
      ))}
    </>
  );
}
