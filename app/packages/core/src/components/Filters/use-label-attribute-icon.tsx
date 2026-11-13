import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

const STYLE = {
  cursor: "pointer",
  fontSize: "1rem",
  marginLeft: 2,
};

/** The eyeball that shows or hides a label attribute in overlays. */
export const AttributeEye = ({
  attribute,
  color,
  dataCy,
  isShown,
  onToggle,
}: {
  attribute: string;
  color?: string;
  dataCy: string;
  isShown: boolean;
  onToggle: () => void;
}) => {
  const theme = useTheme();
  const title = `${isShown ? "Hide" : "Show"} ${attribute} in overlays`;
  const Eye = isShown ? VisibilityIcon : VisibilityOffIcon;

  return (
    <button
      aria-label={title}
      data-cy={dataCy}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
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

const Icon = ({
  color,
  modal,
  path,
}: {
  color?: string;
  modal: boolean;
  path: string;
}) => {
  const toggle = fos.useLabelAttributeToggle(path, modal);

  if (!toggle) {
    return null;
  }

  return (
    <AttributeEye
      attribute={toggle.attribute}
      color={color}
      dataCy={`shown-attribute-${path}`}
      isShown={toggle.isShown}
      onToggle={toggle.toggle}
    />
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
