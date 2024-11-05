import { Dialog } from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { getFetchFunction } from "@fiftyone/utilities";
import React, { Fragment, useState } from "react";
import {
  DeleteLensConfigRequest,
  DeleteLensConfigResponse,
  LensConfig,
  OperatorResponse,
  UpsertLensConfigRequest,
  UpsertLensConfigResponse,
} from "./models";
import {
  Box,
  Button,
  Card,
  FormControl,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  MenuList,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import ErrorIcon from "@mui/icons-material/Error";
import AddIcon from "@mui/icons-material/Add";
import HubIcon from "@mui/icons-material/HubOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

/**
 * Component responsible for handling LensConfig management.
 */
export const LensConfigManager = ({
  configs,
  onConfigsChange,
}: {
  configs: LensConfig[];
  onConfigsChange: (configs: LensConfig[]) => void;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [configId, setConfigId] = useState(null);
  const [operatorName, setOperatorName] = useState(null);
  const [operatorURI, setOperatorURI] = useState(null);
  const [isOperatorValid, setIsOperatorValid] = useState(false);
  const [activeActionsMenu, setActiveActionsMenu] = useState(-1);
  const [isUpsertDialogOpen, setIsUpsertDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const upsertConfigOperator = useOperatorExecutor(
    "@voxel51/operators/lens_upsert_lens_config"
  );
  const deleteConfigOperator = useOperatorExecutor(
    "@voxel51/operators/lens_delete_lens_config"
  );

  // Callback which handles upserting a LensConfig.
  const upsertConfig = async (config: LensConfig) => {
    const request: UpsertLensConfigRequest = {
      id: config.id,
      name: config.name,
      operator_uri: config.operator_uri,
    };

    const callback = (response: OperatorResponse<UpsertLensConfigResponse>) => {
      if (!(response.error || response.result?.error)) {
        const upserted = response.result.config;
        const existingIndex = configs.findIndex(
          (cfg) => cfg.id === upserted.id
        );

        let updatedConfigs: LensConfig[];

        if (existingIndex < 0) {
          // New config; append.
          updatedConfigs = [...configs, upserted];
        } else {
          // Existing config; replace.
          updatedConfigs = configs.slice();
          updatedConfigs[existingIndex] = upserted;
        }

        updatedConfigs.sort((a, b) => a.name.localeCompare(b.name));
        onConfigsChange(updatedConfigs);
      }

      setIsLoading(false);
      resetActionsMenu();
    };

    setIsLoading(true);

    await upsertConfigOperator.execute(request, { callback });
  };

  // Callback which handles deleting a LensConfig.
  const deleteConfig = async (configId: string) => {
    const request: DeleteLensConfigRequest = {
      id: configId,
    };

    const callback = (response: OperatorResponse<DeleteLensConfigResponse>) => {
      if (!(response.error || response.result?.error)) {
        const index = configs.findIndex((cfg) => cfg.id === configId);
        if (index >= 0) {
          onConfigsChange(configs.toSpliced(index, 1));
        }
      }

      setIsLoading(false);
      resetActionsMenu();
    };

    setIsLoading(true);

    await deleteConfigOperator.execute(request, { callback });
  };

  // Callback which handles determining whether an operator exists.
  const checkOperatorExistence = (uri: string) => {
    const requestBody = {
      operator_uri: uri,
      target: "inputs",
    };

    getFetchFunction()("POST", "/operators/resolve-type", requestBody)
      .then(() => {
        setIsOperatorValid(true);
      })
      .catch(() => {
        setIsOperatorValid(false);
      });
  };

  // Callback which updates state based on the current operator URI entered.
  const handleOperatorURIChange = (uri: string) => {
    setOperatorURI(uri);
    checkOperatorExistence(uri);
  };

  // Callback which handles resetting the config context menu.
  const resetActionsMenu = () => {
    setActiveActionsMenu(-1);
    setMenuAnchor(null);
  };

  // Callback which handles opening the config context menu.
  const handleActionsMenuClick = (element: HTMLElement, configIdx: number) => {
    setMenuAnchor(element);
    setActiveActionsMenu(configIdx);
  };

  // Callback which updates state to enable editing a LensConfig.
  const handleEditClick = (config: LensConfig) => {
    setConfigId(config.id);
    setOperatorName(config.name);
    handleOperatorURIChange(config.operator_uri);

    resetActionsMenu();
    setIsUpsertDialogOpen(true);
  };

  // Callback which resets the LensConfig form.
  const resetForm = () => {
    setConfigId(null);
    setOperatorName(null);
    setOperatorURI(null);

    setIsUpsertDialogOpen(false);
  };

  const isFormValid = operatorName && operatorURI && isOperatorValid;

  // Callback which handles LensConfig form submission.
  const handleFormSubmit = () => {
    if (isFormValid) {
      upsertConfig({
        id: configId,
        name: operatorName,
        operator_uri: operatorURI,
      }).then(() => resetForm());
    }
  };

  // Helper function for creating the proper icon when specifying an operator URI.
  const getOperatorStatusIcon = () => {
    if (!operatorURI) {
      return <Fragment />;
    } else if (isOperatorValid) {
      return <CheckCircleOutlineIcon color="success" />;
    } else {
      return <ErrorIcon color="error" />;
    }
  };

  // Helper function for generating the proper 'helper text' content when specifying an operator URI.
  const getOperatorHelperText = () => {
    let text;
    if (!operatorURI) {
      text = " ";
    } else if (isOperatorValid) {
      text = "Operator is valid";
    } else {
      text = "Invalid operator";
    }

    return (
      <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1 }}>
        {getOperatorStatusIcon()}
        <Typography>{text}</Typography>
      </Stack>
    );
  };

  const configsContent =
    configs?.length > 0 ? (
      <Table>
        <TableHead>
          <TableCell>
            <Typography variant="h6" color="secondary">
              DATA SOURCE NAME
            </Typography>
          </TableCell>
          <TableCell>
            <Typography variant="h6" color="secondary">
              OPERATOR
            </Typography>
          </TableCell>
          <TableCell>
            <Typography variant="h6" color="secondary">
              ACTION
            </Typography>
          </TableCell>
        </TableHead>

        <TableBody>
          {configs.map((config, idx) => (
            <TableRow key={config.id}>
              <TableCell>
                <Typography sx={{ fontWeight: "bold" }}>
                  {config.name}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography>{config.operator_uri}</Typography>
              </TableCell>

              <TableCell>
                <IconButton
                  onClick={(e) => handleActionsMenuClick(e.currentTarget, idx)}
                >
                  <MoreVertIcon />
                </IconButton>
                <Menu
                  anchorEl={menuAnchor}
                  open={activeActionsMenu === idx}
                  onClose={() => resetActionsMenu()}
                >
                  <MenuList>
                    <MenuItem onClick={() => handleEditClick(config)}>
                      <ListItemIcon>
                        <EditIcon />
                      </ListItemIcon>
                      <ListItemText>Edit</ListItemText>
                    </MenuItem>

                    <MenuItem onClick={() => deleteConfig(config.id)}>
                      <ListItemIcon>
                        <DeleteIcon color="error" />
                      </ListItemIcon>
                      <ListItemText>
                        <Typography color="error">Delete</Typography>
                      </ListItemText>
                    </MenuItem>
                  </MenuList>
                </Menu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <Fragment />
    );

  const getEmptyContent = () => {
    return (
      <Card
        square={false}
        sx={{
          minHeight: "500px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <Box
            sx={{
              m: 2,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <HubIcon sx={{ fontSize: "6rem", color: "#FFC59B" }} />
          </Box>

          <Box
            sx={{
              m: 2,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Typography textAlign="center" variant="h6">
              Connect to your data source using your custom operator
              <br />
              to start previewing samples in real time.
            </Typography>
          </Box>

          <Box
            sx={{
              m: 2,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setIsUpsertDialogOpen(true)}
            >
              Add data source
            </Button>
          </Box>
        </Box>
      </Card>
    );
  };

  const getNonEmptyContent = () => {
    return (
      <>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Typography variant="h4">{configs.length} Data sources</Typography>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsUpsertDialogOpen(true)}
          >
            Add data source
          </Button>
        </Box>

        <Card square={false}>{configsContent}</Card>
      </>
    );
  };

  const upsertDialog = (
    <Dialog
      open={isUpsertDialogOpen}
      onClose={() => setIsUpsertDialogOpen(false)}
    >
      <Box sx={{ m: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Connect to a data source
        </Typography>

        <Stack sx={{ mt: 1 }} direction="column" spacing={4}>
          <FormControl>
            <Typography color="secondary" sx={{ mb: 1 }}>
              Data source name
            </Typography>
            <TextField
              type="text"
              placeholder="Data source name"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
            />
          </FormControl>

          <FormControl>
            <Typography color="secondary" sx={{ mb: 1 }}>
              Operator
            </Typography>
            <TextField
              type="text"
              placeholder="Operator"
              helperText={getOperatorHelperText()}
              value={operatorURI}
              onChange={(e) => handleOperatorURIChange(e.target.value)}
            />
          </FormControl>

          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Button
              sx={{ mr: 2 }}
              fullWidth
              variant="outlined"
              color="secondary"
              onClick={resetForm}
              disabled={isLoading}
            >
              Cancel
            </Button>

            <Button
              sx={{ ml: 2 }}
              fullWidth
              variant="contained"
              onClick={handleFormSubmit}
              disabled={!isFormValid || isLoading}
            >
              {configId ? "Update" : "Connect"}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Dialog>
  );

  const content =
    configs?.length > 0 ? getNonEmptyContent() : getEmptyContent();

  return (
    <Box sx={{ maxWidth: "750px", m: "auto" }}>
      {content}
      {upsertDialog}
    </Box>
  );
};
