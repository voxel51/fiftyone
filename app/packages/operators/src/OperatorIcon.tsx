import { usePluginDefinition } from "@fiftyone/plugins";
import { IconProps, useColorScheme } from "@mui/material";
import { resolveServerPath } from "./utils";
import { MuiIconFont } from "@fiftyone/components";

export default function OperatorIcon(props: CustomIconPropsType) {
  const {
    pluginName,
    icon,
    lightIcon,
    darkIcon,
    _builtIn,
    Fallback,
    canExecute,
    iconProps,
  } = props;
  const { mode } = useColorScheme();
  const iconPath = mode === "dark" && darkIcon ? darkIcon : lightIcon || icon;

  if (isIconFont(iconPath)) {
    return <MuiIconFont {...(iconProps as IconProps)} name={iconPath} />;
  } else if (!iconPath || !canExecute) {
    return Fallback ? <Fallback /> : null;
  } else if (_builtIn) {
    return <ImageIcon src={iconPath} />;
  } else {
    if (!pluginName) return null;
    return (
      <CustomOperatorIcon
        pluginName={pluginName}
        iconPath={iconPath}
        iconProps={iconProps as JSX.IntrinsicElements["img"]}
      />
    );
  }
}

function CustomOperatorIcon(props: CustomOperatorIconPropsType) {
  const { pluginName, iconPath, iconProps } = props;
  const plugin = usePluginDefinition(pluginName);
  const assetPath = resolveServerPath(plugin);
  const resolvedIconPath = assetPath + iconPath;
  return <ImageIcon src={resolvedIconPath} iconProps={iconProps} />;
}

function ImageIcon(props: ImageIconPropsType) {
  const { src, iconProps } = props;
  return <img {...iconProps} src={src} height={21} width={21} />;
}

function isIconFont(path: string) {
  return (
    typeof path === "string" && !path?.includes("/") && !path?.includes(".")
  );
}

export type CustomIconPropsType = {
  pluginName?: string;
  icon?: string;
  lightIcon?: string;
  darkIcon?: string;
  _builtIn?: boolean;
  Fallback?: React.ComponentType;
  canExecute?: boolean;
  iconProps?: IconProps | JSX.IntrinsicElements["img"];
};

type CustomOperatorIconPropsType = {
  pluginName?: string;
  iconPath?: string;
  iconProps?: JSX.IntrinsicElements["img"];
};

type ImageIconPropsType = {
  src: string;
  iconProps?: JSX.IntrinsicElements["img"];
};
