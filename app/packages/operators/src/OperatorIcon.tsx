import { usePluginDefinition } from "@fiftyone/plugins";
import { useColorScheme } from "@mui/material";
import { resolveServerPath } from "./utils";

export default function OperatorIcon(props: CustomIconPropsType) {
  const {
    pluginName,
    icon,
    lightIcon,
    darkIcon,
    _builtIn,
    Fallback,
    canExecute,
  } = props;
  const { mode } = useColorScheme();
  const iconPath = mode === "dark" && darkIcon ? darkIcon : lightIcon || icon;

  if (!iconPath || !canExecute) return Fallback ? <Fallback /> : null;
  if (_builtIn) return <ImageIcon src={iconPath} />;
  return <CustomOperatorIcon pluginName={pluginName} iconPath={iconPath} />;
}

function CustomOperatorIcon(props: CustomOperatorIconPropsType) {
  const { pluginName, iconPath } = props;
  const plugin = usePluginDefinition(pluginName);
  const assetPath = resolveServerPath(plugin);
  const resolvedIconPath = assetPath + iconPath;
  return <ImageIcon src={resolvedIconPath} />;
}

function ImageIcon(props: ImageIconPropsType) {
  const { src } = props;
  return <img src={src} height={21} width={21} />;
}

export type CustomIconPropsType = {
  pluginName?: string;
  icon?: string;
  lightIcon?: string;
  darkIcon?: string;
  _builtIn?: boolean;
  Fallback?: React.ComponentType;
  canExecute?: boolean;
};

type CustomOperatorIconPropsType = {
  pluginName?: string;
  iconPath?: string;
};

type ImageIconPropsType = {
  src: string;
};
