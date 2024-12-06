import { useMutation, useUserRole } from "@fiftyone/hooks";
import {
  Box,
  DatasetPermissionSelection,
  Dialog,
  RoleSelection,
} from "@fiftyone/teams-components";
import {
  enableDisableOperatorMutation,
  manageOperatorsPluginAtom,
  setOperatorPermissionMutation,
  setOperatorRoleMutation,
} from "@fiftyone/teams-state";
import {
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { startTransition, useState } from "react";
import { useRecoilState } from "recoil";
import { PluginsComponentProps } from "./types";

export default function ManageOperators(props: PluginsComponentProps) {
  const { plugins = [], refresh } = props;
  const [state, setState] = useRecoilState(manageOperatorsPluginAtom);
  const { pluginName, open } = state;
  const plugin = usePluginOperators(plugins, pluginName) || {};

  const { operators = [] } = plugin;

  return (
    <Dialog
      maxWidth="lg"
      title={<Title {...plugin} />}
      open={open}
      onClose={() => {
        setState({ ...state, open: false });
      }}
      hideActionButtons
    >
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>User role</TableCell>
            <TableCell>Dataset permission</TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {operators.map((operator) => (
            <ManageOperator
              key={operator.name}
              plugin={pluginName}
              {...operator}
              refresh={refresh}
            />
          ))}
        </TableBody>
      </Table>
    </Dialog>
  );
}

function usePluginOperators(plugins, name) {
  return plugins.find((plugin) => plugin.name === name);
}

function Title(props) {
  const { name, operators = [] } = props;
  const label = operators.length === 1 ? "operator" : "operators";
  return (
    <Box sx={{ pb: 2 }}>
      <Typography variant="h6">{name}</Typography>
      <Typography>
        {name} has {operators.length} {label}
      </Typography>
      <Typography pt={2}>
        You can configure the user role and dataset permission required to
        execute each operator.
      </Typography>
    </Box>
  );
}

function ManageOperator(props) {
  const { plugin, name, permission, refresh } = props;
  const [state, setState] = useState(permission || {});
  const [setPermission] = useMutation(setOperatorPermissionMutation);
  const [setRole] = useMutation(setOperatorRoleMutation);
  const { minimumRole, minimumDatasetPermission } = state;
  const { getPlugInPermissionOptions, operatorMinRoleOptions } = useUserRole();
  const [operatorPermissionOptions, setOperatorPermissionOptions] = useState(
    getPlugInPermissionOptions(minimumRole)
  );

  return (
    <TableRow sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
      <TableCell>
        <Typography color="text.primary">{name}</Typography>
      </TableCell>
      <TableCell>
        <RoleSelection
          items={operatorMinRoleOptions}
          key={minimumRole}
          defaultValue={minimumRole}
          onChange={(role) => {
            startTransition(() => {
              setRole({
                variables: { pluginName: plugin, operatorName: name, role },
                onSuccess() {
                  setState({ ...state, minimum_role: role });
                  setOperatorPermissionOptions(
                    getPlugInPermissionOptions(role)
                  );
                  refresh();
                },
                successMessage:
                  "Successfully updated the minimum role required for the operator",
              });
            });
          }}
        />
        {/* <Typography>Minimum user role</Typography> */}
      </TableCell>
      <TableCell>
        <DatasetPermissionSelection
          items={operatorPermissionOptions}
          key={minimumDatasetPermission}
          defaultValue={minimumDatasetPermission}
          onChange={(permission) => {
            startTransition(() => {
              setPermission({
                variables: {
                  pluginName: plugin,
                  operatorName: name,
                  permission,
                },
                onSuccess() {
                  setState({ ...state, minimum_role: permission });
                  refresh();
                },
                successMessage:
                  "Successfully updated the minimum dataset permission required for the operator",
              });
            });
          }}
        />
        {/* <Typography>Minimum dataset permission</Typography> */}
      </TableCell>
      <TableCell>
        <ToggleOperator {...props} refresh={refresh} />
      </TableCell>
    </TableRow>
  );
}

function ToggleOperator(props) {
  const { plugin, name, enabled, refresh } = props;
  const [checked, setChecked] = useState(enabled);
  const [toggleOperator, togglingOperator] = useMutation(
    enableDisableOperatorMutation
  );
  const label = checked ? "Enabled" : "Disabled";
  const updateType = !checked ? "enabled" : "disabled";

  return (
    <FormControlLabel
      control={
        <Switch
          sx={{ mr: 1 }}
          size="small"
          checked={checked}
          onChange={() => {
            toggleOperator({
              variables: {
                pluginName: plugin,
                operatorName: name,
                enabled: !checked,
              },
              onSuccess() {
                setChecked(!checked);
                refresh();
              },
              successMessage: `Successfully ${updateType} the operator`,
            });
          }}
          disabled={togglingOperator}
        />
      }
      label={label}
    />
  );
}
