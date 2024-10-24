import {useEffect, useMemo, useState} from 'react';
import {Box, Typography} from '@mui/material';
import {getFetchFunction} from '@fiftyone/utilities';
import {OperatorIO, types} from '@fiftyone/operators';

/**
 * Data model which captures the current values of the form inputs.
 */
export type FormState = {
    [k: string]: any;
}

/**
 * Component responsible for collecting operator input parameters.
 *
 * This component leverages the OperatorIO component to handle form rendering
 *   and user interaction.
 */
export const OperatorConfigurator = (
    {
        operator,
        formState,
        onStateChange,
    }: {
        operator: string;
        formState: FormState;
        onStateChange?: (state: FormState, isValid: boolean) => void;
    }
) => {
    const [operatorSchema, setOperatorSchema] = useState({});

    // JSON schema needs to be converted to the type expected by OperatorIO.
    const schema = useMemo(() => {
        if (!operatorSchema?.type) {
            return null;
        }

        return types.Property.fromJSON(operatorSchema);
    }, [operatorSchema]);

    // Determine which form fields are required based on the operator's schema.
    const requiredFields = useMemo(() => {
        if (!operatorSchema?.type) {
            return [];
        }

        const required = [];
        for (let property in operatorSchema.type.properties) {
            if (operatorSchema.type.properties[property].required) {
                required.push(property);
            }
        }

        return required;
    }, [operatorSchema]);

    // Hook which fetches an operator's schema any time the selected operator changes.
    useEffect(() => {
        const requestBody = {
            operator_uri: operator,
            target: 'inputs',
        };

        setOperatorSchema({});

        getFetchFunction()(
            'POST',
            '/operators/resolve-type',
            requestBody
        ).then((res: object) => setOperatorSchema(res));
    }, [operator, setOperatorSchema]);

    // Callback which handles updates to the form state.
    const updateFormState = (newState: FormState) => {
        const isValid = requiredFields.reduce(
            (prev, current) => prev && !!newState[current],
            true
        );

        onStateChange?.(newState, isValid);
    };

    const ioComponent = (operator && schema) ? (
        <OperatorIO
            schema={schema}
            data={formState}
            onChange={updateFormState}
        />
    ) : (
        <Typography sx={{textAlign: 'center'}}>
            Unable to detect inputs for selected datasource.
            <br/>
            Please ensure that the datasource&apos;s operator is properly
            configured.
        </Typography>
    );

    return (
        <>
            <Box sx={{mt: 2, mb: 2}}>
                {ioComponent}
            </Box>
        </>
    );
};
