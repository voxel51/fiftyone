import { ErrorBoundary, Link, PillButton } from "@fiftyone/components";
import { withSuspense } from "@fiftyone/state";
import { Extension } from "@mui/icons-material";
import styled from "styled-components";
import { types } from ".";
import OperatorIcon from "./OperatorIcon";
import { Operator } from "./operators";
import {
  useOperatorExecutor,
  useOperatorPlacements,
  usePromptOperatorInput,
} from "./state";
import { Placement, Places } from "./types";
import { isPrimitiveString } from "@fiftyone/utilities";

function OperatorPlacements(props: OperatorPlacementsProps) {
  const { place } = props;
  const { placements } = useOperatorPlacements(place);

  return placements.map((placement) => (
    <ErrorBoundary key={placement?.operator?.uri} Fallback={() => null}>
      <OperatorPlacement {...placement} place={place} />
    </ErrorBoundary>
  ));
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
  const { operator, placement, place } = props;
  const { uri, label: operatorLabel, name: operatorName } = operator;
  const { view = {} } = placement;
  const { label } = view;
  const { icon, darkIcon, lightIcon, prompt = true } = view?.options || {};
  const { execute } = useOperatorExecutor(uri);

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
        onClick={handleClick}
        icon={showIcon && IconComponent}
        text={!showIcon && title}
        title={title}
        highlight={place === types.Places.SAMPLES_GRID_ACTIONS}
        style={{ whiteSpace: "nowrap" }}
      />
    );
  }

  return (
    <SquareButton to={handleClick} title={label}>
      {IconComponent}
    </SquareButton>
  );
}

type OperatorPlacementsProps = {
  place: Places;
};

type OperatorPlacementProps = {
  placement: Placement;
  place: Places;
  operator: Operator;
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
