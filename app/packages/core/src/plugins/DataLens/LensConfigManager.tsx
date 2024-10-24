import {useOperatorExecutor} from '@fiftyone/operators';
import {getFetchFunction} from '@fiftyone/utilities';
import React, {Fragment, useState} from 'react';
import {
    DeleteLensConfigRequest,
    DeleteLensConfigResponse,
    LensConfig,
    OperatorResponse,
    UpsertLensConfigRequest,
    UpsertLensConfigResponse
} from './models';
import {
    Box,
    Button,
    Link,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';

/**
 * Component responsible for handling LensConfig management.
 */
export const LensConfigManager = (
    {
        configs,
        onConfigsChange,
        onReturnToLens,
    }: {
        configs: LensConfig[];
        onConfigsChange: (configs: LensConfig[]) => void;
        onReturnToLens: () => void;
    }
) => {
    const [isLoading, setIsLoading] = useState(false);
    const [configId, setConfigId] = useState(null);
    const [operatorName, setOperatorName] = useState(null);
    const [operatorURI, setOperatorURI] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [isOperatorValid, setIsOperatorValid] = useState(false);

    const upsertConfigOperator = useOperatorExecutor('@voxel51/operators/lens_upsert_lens_config');
    const deleteConfigOperator = useOperatorExecutor('@voxel51/operators/lens_delete_lens_config');

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
                const existingIndex = configs.findIndex(cfg => cfg.id === upserted.id);

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
        };

        setIsLoading(true);

        await upsertConfigOperator.execute(request, {callback});
    };

    // Callback which handles deleting a LensConfig.
    const deleteConfig = async (configId: string) => {
        const request: DeleteLensConfigRequest = {
            id: configId,
        };

        const callback = (response: OperatorResponse<DeleteLensConfigResponse>) => {
            if (!(response.error || response.result?.error)) {
                const index = configs.findIndex(cfg => cfg.id === configId);
                if (index >= 0) {
                    onConfigsChange(configs.toSpliced(index, 1));
                }
            }

            setIsLoading(false);
        };

        setIsLoading(true);

        await deleteConfigOperator.execute(request, {callback});
    };

    // Callback which handles determining whether an operator exists.
    const checkOperatorExistence = (uri: string) => {
        const requestBody = {
            operator_uri: uri,
            target: 'inputs',
        };

        getFetchFunction()(
            'POST',
            '/operators/resolve-type',
            requestBody
        ).then(() => {
            setIsOperatorValid(true);
        }).catch(() => {
            setIsOperatorValid(false);
        });
    };

    // Callback which updates state based on the current operator URI entered.
    const handleOperatorURIChange = (uri: string) => {
        setOperatorURI(uri);
        checkOperatorExistence(uri);
    };

    // Callback which updates state to enable editing a LensConfig.
    const handleEditClick = (config: LensConfig) => {
        setConfigId(config.id);
        setOperatorName(config.name);
        setOperatorURI(config.operator_uri);

        setShowForm(true);
    };

    // Callback which resets the LensConfig form.
    const resetForm = () => {
        setConfigId(null);
        setOperatorName(null);
        setOperatorURI(null);

        setShowForm(false);
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
            return <Fragment/>;
        } else if (isOperatorValid) {
            return <CheckCircleIcon color='success' sx={{width: '1em', height: '1em'}}/>;
        } else {
            return <ErrorIcon color='error' sx={{width: '1em', height: '1em'}}/>;
        }
    };

    // Helper function for generating the proper 'helper text' content when specifying an operator URI.
    const getOperatorHelperText = () => {
        let text;
        if (!operatorURI) {
            text = ' ';
        } else if (isOperatorValid) {
            text = 'Operator is valid';
        } else {
            text = 'Invalid operator';
        }

        return (
            <Stack direction='row' alignItems='center' gap={1} sx={{mt: 1}}>
                {getOperatorStatusIcon()}
                <Typography>
                    {text}
                </Typography>
            </Stack>
        );
    };

    const datasourceForm = (
        <Box>
            <Box>
                <TextField sx={{m: 2}} variant='outlined'
                           label='Datasource name'
                           helperText=' '
                           value={operatorName}
                           onChange={e => setOperatorName(e.target.value)}/>

                <TextField sx={{m: 2}} variant='outlined'
                           label='Operator URI'
                           helperText={getOperatorHelperText()}
                           value={operatorURI}
                           onChange={e => handleOperatorURIChange(e.target.value)}/>
            </Box>

            <Stack sx={{mt: 1}} direction='row' spacing={2}>
                <Button variant='contained'
                        onClick={handleFormSubmit}
                        disabled={!isFormValid || isLoading}>
                    Submit
                </Button>

                <Button variant='contained'
                        color='secondary'
                        onClick={resetForm}
                        disabled={isLoading}>
                    Cancel
                </Button>
            </Stack>
        </Box>
    );

    const configsContent = configs?.length > 0 ? (
        <Table>
            <TableHead>
                <TableCell>
                    <Typography variant='h6'>
                        Datasource Name
                    </Typography>
                </TableCell>
                <TableCell>
                    <Typography variant='h6'>
                        Operator URI
                    </Typography>
                </TableCell>
                <TableCell>
                    <Typography variant='h6'>
                        Action
                    </Typography>
                </TableCell>
            </TableHead>

            <TableBody>
                {configs.map(config => (
                    <TableRow key={config.id}>
                        <TableCell>
                            <Typography>
                                {config.name}
                            </Typography>
                        </TableCell>
                        <TableCell>
                            <Typography>
                                {config.operator_uri}
                            </Typography>
                        </TableCell>
                        <TableCell>
                            <Box sx={{
                                display: 'flex',
                                flexWrap: 'nowrap',
                            }}>
                                <Typography sx={{
                                    m: 1,
                                    width: '1.5rem',
                                    height: '1.5rem'
                                }}>
                                    <EditIcon
                                        onClick={() => handleEditClick(config)}/>
                                </Typography>

                                <Typography sx={{
                                    m: 1,
                                    width: '1.5rem',
                                    height: '1.5rem'
                                }}>
                                    <DeleteIcon
                                        onClick={() => deleteConfig(config.id)}/>
                                </Typography>
                            </Box>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    ) : (
        <Typography sx={{textAlign: 'center'}}>
            You have not configured any datasources yet.
            <br/>
            Add a new datasource to get started.
        </Typography>
    );

    return (
        <Box sx={{m: 2}}>
            <Box sx={{display: 'flex', justifyContent: 'end'}}>
                <Typography variant='h6'>
                    <Link href='https://docs.voxel51.com' target='_blank'>
                        Need help with Lens?
                    </Link>
                </Typography>
            </Box>

            <Box sx={{maxWidth: '750px', m: 'auto', p: 2}}>
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 4,
                }}>
                    <Typography variant='h3'>
                        Lens Datasources
                    </Typography>

                    <Button variant='text'
                            onClick={onReturnToLens}>
                        Back to Lens
                    </Button>
                </Box>

                <Box sx={{textAlign: 'center', mb: 8}}>
                    <Typography sx={{textAlign: 'center'}} variant='h6'>
                        To connect to a datasource, create an operator which
                        adheres
                        to the interface described in the
                        <br/>
                        <Link href='https://docs.voxel51.com' target='_blank'>
                            Data Lens documentation
                        </Link>.
                    </Typography>

                    <Typography sx={{mt: 2}} variant='h6'>
                        Once created, simply provide the operator&apos;s URI to
                        enable seamless data exploration.
                    </Typography>
                </Box>

                <Box>
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'space-between'
                    }}>
                        <Typography variant='h5'>
                            Connected Datasources
                        </Typography>

                        <Button variant='contained'
                                startIcon={<AddIcon/>}
                                onClick={() => setShowForm(true)}>
                            Add new datasource
                        </Button>
                    </Box>

                    <Box sx={{mb: 4}}>
                        {showForm && datasourceForm}
                    </Box>

                    {configsContent}
                </Box>

            </Box>
        </Box>
    );
};
