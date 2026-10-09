import { type IconInput, Pill, Size, Tooltip } from "@voxel51/voodo";

/** A clickable count, e.g. how many fields a group's clear action affects. */
const CountPill = ({
  dataCy,
  icon,
  onClick,
  text,
  title,
}: {
  dataCy?: string;
  icon: IconInput;
  onClick: () => void;
  text: string;
  title: string;
}) => (
  <Tooltip content={title} style={{ display: "flex", margin: "0 0.25rem" }}>
    <Pill
      size={Size.Xs}
      icon={icon}
      data-cy={dataCy}
      onClick={onClick}
      // a press on the pill is not a press on the entry it sits in
      onMouseDown={(e) => e.stopPropagation()}
      style={{ cursor: "pointer" }}
    >
      {text}
    </Pill>
  </Tooltip>
);

export default CountPill;
