import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

const STYLE = {
  cursor: "pointer",
  fontSize: "1rem",
  marginLeft: 2,
};

const Icon = ({
  color,
  modal,
  path,
}: {
  color?: string;
  modal: boolean;
  path: string;
}) => {
  const theme = useTheme();
  const toggle = fos.useLabelAttributeToggle(path, modal);

  if (!toggle) {
    return null;
  }

  const { attribute, isShown } = toggle;
  const title = `${isShown ? "Hide" : "Show"} ${attribute} in overlays`;
  const Eye = isShown ? VisibilityIcon : VisibilityOffIcon;

  return (
    <button
      aria-label={title}
      data-cy={`shown-attribute-${path}`}
      onClick={(event) => {
        event.stopPropagation();
        toggle.toggle();
      }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        margin: 0,
        padding: 0,
      }}
      title={title}
      type="button"
    >
      <Eye
        style={{
          ...STYLE,
          color: isShown ? color : theme.text.secondary,
        }}
      />
    </button>
  );
};

export default function useLabelAttributeIcon(
  modal: boolean,
  named: boolean,
  path: string,
  color?: string,
) {
  if (!named) {
    return null;
  }

  return <Icon color={color} modal={modal} path={path} />;
}
