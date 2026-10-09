import {
  Checkbox,
  ExternalLinkIcon,
  Input,
  Size,
  Text,
  TextColor,
  TextVariant,
  ToggleSwitch,
} from "@voxel51/voodo";
import { type ReactNode, useEffect, useState } from "react";
import styles from "./Panel.module.css";

/** A section's title, with a link to more on it. */
export const PanelTitle = ({
  children,
  href,
  title,
}: {
  children: string;
  href?: string;
  title?: string;
}) => (
  <div className={styles.title}>
    <Text variant={TextVariant.HeadingSm} color={TextColor.Primary}>
      {children}
    </Text>
    {href && (
      <a
        className={styles.link}
        href={href}
        rel="noreferrer"
        target="_blank"
        title={title}
      >
        <ExternalLinkIcon size={12} />
      </a>
    )}
  </div>
);

/** A titled group of controls. */
export const PanelSection = ({
  children,
  href,
  linkTitle,
  title,
}: {
  children: ReactNode;
  href?: string;
  linkTitle?: string;
  title: string;
}) => (
  <section className={styles.section}>
    <PanelTitle href={href} title={linkTitle}>
      {title}
    </PanelTitle>
    {children}
  </section>
);

/** A labelled checkbox; a muted one shows its value but cannot change. */
export const PanelCheckbox = ({
  muted,
  name,
  setValue,
  value,
}: {
  muted?: boolean;
  name: string;
  setValue: (value: boolean) => void;
  value: boolean;
}) => (
  // sized to its content, so a press on its center lands on the label
  <div className={styles.check} data-cy={`checkbox-${name}`} title={name}>
    <Checkbox
      checked={value}
      disabled={muted}
      label={name}
      size={Size.Sm}
      onChange={setValue}
    />
  </div>
);

export type PanelTab = {
  text: string;
  title: string;
  dataCy?: string;
  onClick: () => void;
};

/** One of a few options, side by side. */
export const PanelTabs = ({
  active,
  options,
}: {
  active: string;
  options: PanelTab[];
}) => (
  <ToggleSwitch
    fullWidth
    index={options.findIndex(({ text }) => text === active)}
    size={Size.Xs}
    tabPanelClassName={styles.hidden}
    tabs={options.map(({ dataCy, text, title }) => ({
      id: text,
      data: {
        content: null,
        label: (
          <span
            className={styles.tab}
            data-cy={dataCy ?? `tab-option-${title}`}
            title={title}
          >
            {text}
          </span>
        ),
      },
    }))}
    onChange={(index) => options[index]?.onClick()}
  />
);

/** Rows of actions, edge to edge like a menu's. */
export const PanelList = ({ children }: { children: ReactNode }) => (
  <div className={styles.list}>{children}</div>
);

/** A row that runs an action. */
export const PanelItem = ({
  onClick,
  text,
  title,
}: {
  onClick: () => void;
  text: string;
  title?: string;
}) => (
  <button
    type="button"
    className={styles.item}
    data-cy={`item-action-${text.replace(/[\s.,/]/g, "-").toLowerCase()}`}
    title={title ?? text}
    onClick={onClick}
  >
    <Text variant={TextVariant.BodySecondary} color={TextColor.Primary}>
      {text}
    </Text>
  </button>
);

/** A note in place of a section's controls. */
export const PanelNote = ({ children }: { children: ReactNode }) => (
  <Text
    className={styles.note}
    variant={TextVariant.BodyTertiary}
    color={TextColor.Secondary}
  >
    {children}
  </Text>
);

/**
 * A whole number, set on Enter or leaving the field; clearing it resets the
 * setting, and anything else not a number is dropped.
 */
export const PanelNumber = ({
  onCommit,
  placeholder,
  unit,
  value,
}: {
  onCommit: (value: number | null) => void;
  placeholder?: string;
  unit: string;
  value: number;
}) => {
  const [draft, setDraft] = useState(value.toString());
  useEffect(() => setDraft(value.toString()), [value]);

  const commit = () => {
    if (draft === "") {
      onCommit(null);
      return;
    }
    const parsed = Number.parseInt(draft);
    Number.isNaN(parsed) ? setDraft(value.toString()) : onCommit(parsed);
  };

  return (
    <div className={styles.number}>
      <Input
        placeholder={placeholder}
        size={Size.Sm}
        type="number"
        value={draft}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      <Text variant={TextVariant.BodySecondary} color={TextColor.Secondary}>
        {unit}
      </Text>
    </div>
  );
};
