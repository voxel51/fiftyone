import {
  Button,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useSetSchemaEditorGUIJSONToggle } from "./hooks";
import { CenteredEmptyState } from "./styled";

const NoActiveSchema = () => {
  const setTab = useSetSchemaEditorGUIJSONToggle();
  return (
    <CenteredEmptyState>
      <Icon
        name={IconName.Edit}
        size={Size.Xl}
        style={{ color: "#FF9950", marginBottom: 16 }}
      />
      <Text variant={TextVariant.Lg} style={{ textAlign: "center" }}>
        No active schemas yet
      </Text>
      <Text
        color={TextColor.Secondary}
        style={{ textAlign: "center", marginBottom: 16 }}
      >
        Select fields that you'd like to add schemas to for annotation
      </Text>
      <Button
        size={Size.Md}
        variant={Variant.Primary}
        onClick={() => setTab("other")}
      >
        Select fields to import{" "}
        <Icon
          name={IconName.ArrowRight}
          size={Size.Md}
          style={{ marginLeft: 4 }}
        />
      </Button>
    </CenteredEmptyState>
  );
};

export default NoActiveSchema;
