/**
 * Shared camera sensitivity and pitch clamp constants for V27.5 & V28 3D Exhibition scenes.
 * Extracted into a zero-dependency module so V28 never pulls Legacy V27.5 ExhibitionScene into its bundle.
 */
export const DRAG_YAW_SENSITIVITY = 0.0052;
export const DRAG_PITCH_SENSITIVITY = 0.0038;
export const TOUCH_YAW_SENSITIVITY = 0.0068;
export const TOUCH_PITCH_SENSITIVITY = 0.0046;
export const MIN_CAMERA_PITCH = -0.38;
export const MAX_CAMERA_PITCH = 0.42;
