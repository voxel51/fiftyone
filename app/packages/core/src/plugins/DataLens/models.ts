/**
 * Base response type.
 */
export type BaseResponse = {
    error?: string;
}

/**
 * Request type for sample preview functionality.
 */
export type PreviewRequest = {
    search_params: object;
    operator_uri: string;
    query_type: string;
    max_results: number;
}

/**
 * Response type for sample preview functionality.
 */
export type PreviewResponse = {
    result_count: number;
    query_result: object[];
    field_schema: object;
} & BaseResponse;

/**
 * Request type for sample import functionality.
 */
export type ImportRequest = {
    search_params: object;
    operator_uri: string;
    batch_size: number;
    dataset_name: string;
    query_type: string;
};

/**
 * Response type for sample import functionality.
 */
export type ImportResponse = {} & BaseResponse;

/**
 * Lens configuration metadata.
 * A LensConfig object is meant to represent a configured datasource.
 */
export type LensConfig = {
    id: string;
    name: string;
    operator_uri: string;
};

/**
 * Request type for listing available lens configurations.
 */
export type ListLensConfigsRequest = {};

/**
 * Response type for listing available lens configurations.
 */
export type ListLensConfigsResponse = {
    configs: LensConfig[];
} & BaseResponse;

/**
 * Request type for upserting a lens config.
 */
export type UpsertLensConfigRequest = {
    id?: string;
    name: string;
    operator_uri: string;
};

/**
 * Response type for upserting a lens config.
 */
export type UpsertLensConfigResponse = {
    config: LensConfig;
} & BaseResponse;

/**
 * Request type for deleting a lens config.
 */
export type DeleteLensConfigRequest = {
    id: string;
};

/**
 * Repsonse type for deleting a lens config.
 */
export type DeleteLensConfigResponse = {} & BaseResponse;

/**
 * Generic response type for operators.
 */
export type OperatorResponse<T> = {
    result: T;
    error?: string;
};
