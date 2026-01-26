import { MuiIconFont } from "@fiftyone/components";
import { Typography } from "@mui/material";
import { Button, Icon, IconName, Size, Variant } from "@voxel51/voodo";
import { useSetSchemaEditorGUIJSONToggle } from "./hooks";
import { CenteredEmptyState } from "./styled";

const NoActiveSchema = () => {
  const setTab = useSetSchemaEditorGUIJSONToggle();
  return (
    <CenteredEmptyState>
      <MuiIconFont
        sx={{
          fontSize: 64,
          color: "#FF9950",
          marginBottom: 2,
        }}
        name={"draw"}
      />
      <Typography variant="h6" textAlign="center">
        No active schemas yet
      </Typography>
      <Typography color="secondary" textAlign="center" sx={{ marginBottom: 2 }}>
        Select fields that you’d like to add schemas to for annotation
      </Typography>
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
