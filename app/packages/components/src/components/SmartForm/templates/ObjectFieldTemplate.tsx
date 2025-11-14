/**
 * Custom ObjectFieldTemplate that ensures vertical stacking of form fields
 *
 * This overrides the default @rjsf/mui Grid layout to match SchemaIO's
 * vertical field layout style.
 */

import { ObjectFieldTemplateProps } from "@rjsf/utils";
import { Box } from "@mui/material";

export default function ObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { properties, title, description } = props;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2, // Consistent spacing between fields
        width: "100%",
      }}
    >
      {title && (
        <Box
          component="h3"
          sx={{
            margin: 0,
            marginBottom: 1,
            fontSize: "1.1rem",
            fontWeight: 500,
          }}
        >
          {title}
        </Box>
      )}
      {description && (
        <Box
          component="p"
          sx={{
            margin: 0,
            marginBottom: 2,
            color: "text.secondary",
          }}
        >
          {description}
        </Box>
      )}
      {properties.map((element) => (
        <Box key={element.name} sx={{ width: "100%" }}>
          {element.content}
        </Box>
      ))}
    </Box>
  );
}
