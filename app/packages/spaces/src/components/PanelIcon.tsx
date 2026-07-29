import ExtensionIcon from "@mui/icons-material/Extension";
import { usePanel } from "../hooks";
import { PanelIconProps } from "../types";
import { warnPanelNotFound } from "../utils";
import { Box } from "@mui/material";

// A renderable react element type is a function or an exotic object carrying
// $$typeof (memo, forwardRef). Anything else that arrives here is CJS/ESM
// interop residue — a module object whose component sits under .default —
// which React rejects with error #130. Icons reach this component from
// arbitrary plugin bundles (and from bundler default-import interop), so
// unwrap rather than assume.
function toRenderableIcon(
  icon: unknown,
): React.ComponentType<unknown> | undefined {
  if (typeof icon === "function") return icon as React.ComponentType<unknown>;
  if (icon && typeof icon === "object") {
    if ((icon as { $$typeof?: symbol }).$$typeof) {
      return icon as unknown as React.ComponentType<unknown>;
    }
    const inner = (icon as { default?: unknown }).default;
    if (inner) return toRenderableIcon(inner);
  }
  return undefined;
}

export default function PanelIcon(props: PanelIconProps) {
  const { name } = props;
  const panel = usePanel(name);
  if (!panel) return warnPanelNotFound(name);
  const PanelTabIcon =
    toRenderableIcon(panel.Icon) ?? toRenderableIcon(ExtensionIcon);
  if (!PanelTabIcon) return null;
  return (
    <Box sx={{ mr: "0.75rem", width: "1rem", height: "1.5rem" }}>
      <PanelTabIcon
        style={{
          width: "1rem",
          height: "1rem",
        }}
      />
    </Box>
  );
}
