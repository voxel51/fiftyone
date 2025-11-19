/**
 * Custom ObjectFieldTemplate that ensures vertical stacking of form fields
 *
 * This overrides the default @rjsf/mui Grid layout to match SchemaIO's
 * vertical field layout style.
 */

import { ObjectFieldTemplateProps } from "@rjsf/utils";
import { Box } from "@mui/material";

export default function ObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { properties, title, description, uiSchema } = props;

  // Check if this object should use horizontal layout (GridView)
  const layout = uiSchema?.["ui:options"]?.layout;
  const isHorizontal = layout === "horizontal";
  const gap = uiSchema?.["ui:options"]?.gap ?? 2;
  const hideTitle = uiSchema?.["ui:options"]?.hideTitle === true;

  return (
    <Box sx={{ width: "100%" }}>
      {title && !hideTitle && (
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
      <Box
        sx={{
          display: "flex",
          flexDirection: isHorizontal ? "row" : "column",
          gap: gap,
          width: "100%",
        }}
      >
        {properties.map((element) => (
          <Box
            key={element.name}
            sx={{
              width: isHorizontal ? "auto" : "100%",
              flex: isHorizontal ? 1 : "none",
            }}
          >
            {element.content}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
