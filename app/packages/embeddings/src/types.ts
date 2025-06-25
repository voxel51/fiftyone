/**
 * Represents an error returned from the embeddings plot API.
 */
export type PlotError = {
    message: string;
    stack: string;
};

/**
 * Response type for an error from the plot API.
 */
export type PlotErrorResponse = {
    error: PlotError;
};

/**
 * Response type for a successful plot API call.
 */
export type PlotSuccessResponse = {
    index_size: number;
    available_count: number;
    missing_count: number;
    patches_field: string;
    points_field: string;
};

/**
 * Union type for possible plot API responses.
 */
export type PlotResponse = PlotErrorResponse | PlotSuccessResponse;