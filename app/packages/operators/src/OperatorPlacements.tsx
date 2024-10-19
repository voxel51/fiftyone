import {
  AdaptiveMenuItemComponentPropsType,
  ErrorBoundary,
  Link,
  PillButton,
} from "@fiftyone/components";
import { withSuspense } from "@fiftyone/state";
import { isPrimitiveString } from "@fiftyone/utilities";
import { Extension } from "@mui/icons-material";
import styled from "styled-components";
import { types } from ".";
import OperatorIcon from "./OperatorIcon";
import { Operator } from "./runtime/operators";
import {
  useOperatorExecutor,
  useOperatorPlacements,
  usePromptOperatorInput,
} from "./state";
import { Placement, Places } from "./types";

import { getStringAndNumberProps } from "@fiftyone/core/src/components/Actions/utils";

export function OperatorPlacementWithErrorBoundary(
  props: OperatorPlacementProps
) {
  return (
    <ErrorBoundary
      Fallback={(errorProps) => {
        return <PlacementError {...props} {...errorProps} />;
      }}
    >
      <OperatorPlacement {...props} />
    </ErrorBoundary>
  );
}

function OperatorPlacements(props: OperatorPlacementsProps) {
  const { place, modal } = props;
  const { placements } = useOperatorPlacements(place);

  return placements.map((placement) => (
    <OperatorPlacementWithErrorBoundary
      key={placement?.operator?.uri}
      modal={modal}
      place={place}
      {...placement}
    />
  ));
}

function PlacementError(props) {
  const { adaptiveMenuItemProps, error, operator } = props;
  console.error(error);
  const operatorURI = operator?.uri;
  const postfix = operatorURI ? ` for ${operatorURI}` : "";
  return (
    <PillButton
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      icon={
        <OperatorIcon
          icon="error"
          iconProps={{ sx: { color: (theme) => theme.palette.error.main } }}
        />
      }
      title={error?.message || `Failed to load placement${postfix}`}
      onClick={() => {
        // do nothing
      }}
    />
  );
}

export default withSuspense(OperatorPlacements, () => null);

const componentByView = {
  Button: ButtonPlacement,
};

function getPlacementComponent(placement: Placement) {
  const viewName = placement?.view?.name;

  return componentByView[viewName] || componentByView.Button;
}

function OperatorPlacement(props: OperatorPlacementProps) {
  const { placement } = props;
  const Component = getPlacementComponent(placement);
  return <Component {...props} />;
}

function ButtonPlacement(props: OperatorPlacementProps) {
  const promptForInput = usePromptOperatorInput();
  const { operator, placement, place, adaptiveMenuItemProps, modal } = props;
  const { uri, label: operatorLabel, name: operatorName } = operator;
  const { view = {} } = placement;
  const { label } = view;
  const { icon, darkIcon, lightIcon, prompt = true } = view?.options || {};
  const { execute } = useOperatorExecutor(uri);
  const canExecute = operator?.config?.canExecute;

  const showIcon =
    isPrimitiveString(icon) ||
    isPrimitiveString(darkIcon) ||
    isPrimitiveString(lightIcon);
  const title = label || operatorLabel || operatorName;

  const IconComponent = (
    <OperatorIcon
      {...operator}
      icon={icon}
      darkIcon={darkIcon}
      lightIcon={lightIcon}
      Fallback={Extension}
      canExecute={canExecute}
    />
  );

  const handleClick = () => {
    if (prompt) {
      promptForInput(uri);
    } else {
      execute({});
    }
  };

  if (
    place === types.Places.SAMPLES_GRID_ACTIONS ||
    place === types.Places.SAMPLES_GRID_SECONDARY_ACTIONS ||
    place === types.Places.SAMPLES_VIEWER_ACTIONS
  ) {
    return (
      <PillButton
        {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
        onClick={handleClick}
        icon={showIcon && IconComponent}
        text={!showIcon && title}
        title={title}
        highlight={place === types.Places.SAMPLES_GRID_ACTIONS}
        style={{ whiteSpace: "nowrap" }}
        tooltipPlacement={modal ? "top" : "bottom"}
      />
    );
  }

  return (
    <SquareButton
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      to={handleClick}
      title={label}
    >
      {IconComponent}
    </SquareButton>
  );
}

type OperatorPlacementsProps = {
  place: Places;
  modal?: boolean;
};

type OperatorPlacementProps = {
  modal?: boolean;
  placement: Placement;
  place: Places;
  operator: Operator;
  adaptiveMenuItemProps?: AdaptiveMenuItemComponentPropsType;
};

// todo: consolidate and move to component
const SquareButton = styled(Link)`
  display: flex;
  color: var(--fo-palette-primary-plainColor);
  align-items: center;
  cursor: pointer;
  border-bottom: 1px var(--fo-palette-primary-plainColor) solid;
  background: var(--fo-palette-neutral-softBg);
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  padding: 9px 3.5px;
`;
