import settingsStyles from "../../tiles/Tile.settings.module.css";

/**
 * The one list-filter input for episode settings surfaces, so "filter this
 * list" renders identically wherever it appears.
 */
export function SettingsFilterInput({
  ariaLabel,
  onChange,
  placeholder,
  value,
}: {
  readonly ariaLabel?: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
}) {
  return (
    <input
      aria-label={ariaLabel ?? placeholder}
      className={settingsStyles.filterInput}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type="text"
      value={value}
    />
  );
}
