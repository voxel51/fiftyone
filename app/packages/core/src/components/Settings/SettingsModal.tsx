import { Close } from "@mui/icons-material";
import {
  Brush as AppearanceIcon,
  Lock as SecurityIcon,
  Notifications as NotificationsIcon,
  Keyboard as HotkeysIcon,
} from "@mui/icons-material";
import { useAtom } from "jotai";
import React, { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { SettingsSection } from "./state";
import { settingsOpenAtom, settingsSectionAtom } from "./state";
import {
  CloseButton,
  ContentArea,
  ContentHeader,
  ContentScroll,
  ContentTitle,
  LeftNav,
  NavItem,
  NavTitle,
  Overlay,
  Panel,
} from "./styled";
import Appearance from "./sections/Appearance";
import Hotkeys from "./sections/Hotkeys";
import Notifications from "./sections/Notifications";
import Security from "./sections/Security";

type NavEntry = {
  id: SettingsSection;
  label: string;
  Icon: React.ElementType;
};

const NAV: NavEntry[] = [
  { id: "appearance", label: "Appearance", Icon: AppearanceIcon },
  { id: "hotkeys", label: "Hotkeys", Icon: HotkeysIcon },
  { id: "notifications", label: "Notifications", Icon: NotificationsIcon },
  { id: "security", label: "Security", Icon: SecurityIcon },
];

const SECTION_TITLES: Record<SettingsSection, string> = {
  appearance: "Appearance",
  hotkeys: "Keyboard Shortcuts",
  notifications: "Notifications",
  security: "Security",
};

const SectionContent = ({ section }: { section: SettingsSection }) => {
  switch (section) {
    case "appearance":
      return <Appearance />;
    case "hotkeys":
      return <Hotkeys />;
    case "notifications":
      return <Notifications />;
    case "security":
      return <Security />;
  }
};

const SettingsModal = () => {
  const [, setOpen] = useAtom(settingsOpenAtom);
  const [section, setSection] = useAtom(settingsSectionAtom);

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return createPortal(
    <Overlay onClick={close}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <LeftNav>
          <NavTitle>Settings</NavTitle>
          {NAV.map(({ id, label, Icon }) => (
            <NavItem
              key={id}
              $active={section === id}
              onClick={() => setSection(id)}
            >
              <Icon style={{ fontSize: "1rem" }} />
              {label}
            </NavItem>
          ))}
        </LeftNav>

        <ContentArea>
          <ContentHeader>
            <ContentTitle>{SECTION_TITLES[section]}</ContentTitle>
            <CloseButton onClick={close} title="Close">
              <Close style={{ fontSize: "1.1rem" }} />
            </CloseButton>
          </ContentHeader>
          <ContentScroll>
            <SectionContent section={section} />
          </ContentScroll>
        </ContentArea>
      </Panel>
    </Overlay>,
    document.body
  );
};

export default SettingsModal;
