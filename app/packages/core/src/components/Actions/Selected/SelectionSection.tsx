import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { ActionOption, type ActionOptionProps } from "../Common";

type SelectionSectionProps = {
  label: string;
  items: ({ key: string } & ActionOptionProps)[];
};

/** Keep section headings paired with at least one available action. */
export default function SelectionSection({
  label,
  items,
}: SelectionSectionProps) {
  const visibleItems = items.filter(({ hidden }) => !hidden);
  if (!visibleItems.length) {
    return null;
  }

  return (
    <div role="group" aria-label={label} style={{ padding: "0.25rem 0" }}>
      <Text
        variant={TextVariant.Xs}
        color={TextColor.Secondary}
        style={{ display: "block", textTransform: "capitalize" }}
      >
        {label}
      </Text>
      {visibleItems.map(({ key, ...props }) => (
        <ActionOption key={key} {...props} />
      ))}
    </div>
  );
}
