import { SYSTEM_READ_ONLY_FIELD_NAME } from "./constants";
import { formatAttributeCount } from "./utils";

/**
 * Build secondary content string for field display
 */
export const SecondaryText = ({
  fieldType,
  attrCount,
  isSystemReadOnly,
}: {
  fieldType: string;
  attrCount: number;
  isSystemReadOnly: boolean;
}) => {
  const typeText = isSystemReadOnly ? SYSTEM_READ_ONLY_FIELD_NAME : fieldType;
  if (!isSystemReadOnly && attrCount > 0) {
    return (
      <div data-cy="secondary-content">
        {`${typeText} • ${formatAttributeCount(attrCount)}`}
      </div>
    );
  }
  return <div data-cy="secondary-content">{typeText}</div>;
};

export default SecondaryText;
