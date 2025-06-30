/**
 * Response type for an error from the plot API.
 */
export type PlotErrorResponse = {
    error: string;
    stack: string;
    details?: string;
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