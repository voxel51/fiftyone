/**
 * Constants for camera frustum visualization.
 */

// =============================================================================
// GEOMETRY CONSTANTS
// =============================================================================

/** Static frustum depth (distance from camera to far plane) */
export const FRUSTUM_DEPTH = 2;

/** Minimum frustum depth to ensure visibility */
export const FRUSTUM_MIN_DEPTH = 0.5;

/** Maximum frustum depth to prevent overwhelming the scene */
export const FRUSTUM_MAX_DEPTH = 50;

/** Default near plane distance (small offset from camera origin) */
export const FRUSTUM_NEAR_PLANE_DISTANCE = 0.01;

/** Default field of view in degrees when intrinsics unavailable */
export const FRUSTUM_DEFAULT_FOV_DEGREES = 60;

/** Default aspect ratio when intrinsics unavailable */
export const FRUSTUM_DEFAULT_ASPECT_RATIO = 16 / 9;

// =============================================================================
// COLORS
// =============================================================================

/** Color for frustum wireframes (gray) */
export const FRUSTUM_COLOR = "#888888";

/** Highlight color when frustum is hovered (Voxel51 orange) */
export const FRUSTUM_HOVER_COLOR = "#FF6D04";

/** X-axis color (red) */
export const FRUSTUM_AXIS_X_COLOR = "#ff0000";

/** Y-axis color (green) */
export const FRUSTUM_AXIS_Y_COLOR = "#00ff00";

/** Z-axis color (blue) */
export const FRUSTUM_AXIS_Z_COLOR = "#0000ff";

// =============================================================================
// OPACITY
// =============================================================================

/** Opacity for the semi-transparent far plane (almost transparent) */
export const FRUSTUM_PLANE_OPACITY = 0.1;

/** Opacity when hovering (more visible for interaction feedback) */
export const FRUSTUM_HOVER_OPACITY = 0.3;

/** Opacity for texture when displayed on far plane */
export const FRUSTUM_TEXTURE_OPACITY = 0.85;

/** Opacity for texture when hovered (fully opaque to stand out) */
export const FRUSTUM_TEXTURE_HOVER_OPACITY = 1.0;

// =============================================================================
// LINE WIDTHS & SIZES
// =============================================================================

/** Line width for frustum wireframe edges */
export const FRUSTUM_LINE_WIDTH = 2;

/** Line width for axes at camera origin */
export const FRUSTUM_AXES_LINE_WIDTH = 2;

/** Size of the axes helper at each camera origin */
export const FRUSTUM_AXES_SIZE = 0.5;

// =============================================================================
// TOP MARKER TRIANGLE
// =============================================================================

/** Half-width of top marker triangle base as fraction of far plane width */
export const FRUSTUM_TOP_MARKER_BASE_HALF_WIDTH = 0.05;

/** Height of top marker triangle as fraction of far plane width */
export const FRUSTUM_TOP_MARKER_HEIGHT = 0.05;

// =============================================================================
// AXIS ARROW HEADS (shown on hover)
// =============================================================================

/** Radius of the cone arrow head at the tip of each axis */
export const FRUSTUM_AXIS_ARROW_RADIUS = 0.04;

/** Height of the cone arrow head */
export const FRUSTUM_AXIS_ARROW_HEIGHT = 0.1;
