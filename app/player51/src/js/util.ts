/**
 * @module util.js
 * @summary Utilities for player51
 *
 * Copyright 2017-2021, Voxel51, Inc.
 * Alan Stahl, alan@voxel51.com
 */

export const ICONS = Object.freeze({
  play:
    'data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"%3E%3Cpath fill="rgb(238, 238, 238)" d="M8 5v14l11-7z"/%3E%3Cpath d="M0 0h24v24H0z" fill="none"/%3E%3C/svg%3E',
  pause:
    'data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"%3E%3Cpath fill="rgb(238, 238, 238)" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/%3E%3Cpath d="M0 0h24v24H0z" fill="none"/%3E%3C/svg%3E',
  options:
    'data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24" viewBox="0 0 24 24" width="24"%3E%3Cg%3E%3Cpath d="M0,0h24v24H0V0z" fill="none"/%3E%3Cpath fill="rgb(238, 238, 238)" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/%3E%3C/g%3E%3C/svg%3E',
});

/**
 * Shallow data-object comparison for equality
 * @param {Object} a - first object to compare
 * @param {Object} b - second object to compare
 * @return {boolean} true if ==
 */
export function compareData(a, b) {
  for (const p in a) {
    if (a.hasOwnProperty(p) !== b.hasOwnProperty(p)) {
      return false;
    } else if (a[p] != b[p]) {
      return false;
    }
  }
  for (const p in b) {
    if (!(p in a)) {
      return false;
    }
  }
  return true;
}

/**
 * Scales a number from one range to another.
 *
 * @param {number} n number to scale
 * @param {number} oldMin minumum of current range
 * @param {number} oldMax maximum of current range
 * @param {number} newMin minumum of range to scale to
 * @param {number} newMax maximum of range to scale to
 * @return {number} scaled value
 */
export function rescale(n, oldMin, oldMax, newMin, newMax) {
  const normalized = (n - oldMin) / (oldMax - oldMin);
  return normalized * (newMax - newMin) + newMin;
}

/**
 * Checks whether a point is contained in a rectangle.
 *
 * @param {number} x point X coordinate
 * @param {number} y point Y coordinate
 * @param {number} rectX rectangle's leftmost X coordinate
 * @param {number} rectY rectangle's topmost Y coordinate
 * @param {number} rectW rectangle's width
 * @param {number} rectH rectangle's height
 * @return {boolean}
 */
export function inRect(x, y, rectX, rectY, rectW, rectH) {
  return x >= rectX && x <= rectX + rectW && y >= rectY && y <= rectY + rectH;
}

/**
 * Calculates the distance between two points.
 *
 * @param {number} x1 point 1 X coordinate
 * @param {number} y1 point 1 Y coordinate
 * @param {number} x2 point 2 X coordinate
 * @param {number} y2 point 2 Y coordinate
 * @return {number} distance
 */
export function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

/**
 * Calculates the dot product of two 2D vectors.
 *
 * @param {number} ax vector 1 X coordinate
 * @param {number} ay vector 1 Y coordinate
 * @param {number} bx vector 2 X coordinate
 * @param {number} by vector 2 Y coordinate
 * @return {number} dot product
 */
export function dot2d(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

/**
 * Projects a point onto a line defined by two other points.
 *
 * @param {number} px point X coordinate
 * @param {number} py point Y coordinate
 * @param {number} ax line point 1 X coordinate
 * @param {number} ay line point 1 Y coordinate
 * @param {number} bx line point 2 X coordinate
 * @param {number} by line point 2 Y coordinate
 * @return {array} projected [x, y] coordinates
 */
export function project2d(px, py, ax, ay, bx, by) {
  // line vector - this is relative to (0, 0), so coordinates of p need to be
  // transformed accordingly
  const vx = bx - ax;
  const vy = by - ay;
  const projMagnitude = dot2d(px - ax, py - ay, vx, vy) / dot2d(vx, vy, vx, vy);
  const projX = projMagnitude * vx + ax;
  const projY = projMagnitude * vy + ay;
  return [projX, projY];
}

/**
 * Calculates the distance from a point to a line segment defined by two other
 * points.
 *
 * @param {number} px point X coordinate
 * @param {number} py point Y coordinate
 * @param {number} ax line point 1 X coordinate
 * @param {number} ay line point 1 Y coordinate
 * @param {number} bx line point 2 X coordinate
 * @param {number} by line point 2 Y coordinate
 * @return {number} distance
 */
export function distanceFromLineSegment(px, py, ax, ay, bx, by) {
  const segmentLength = distance(ax, ay, bx, by);
  const [projX, projY] = project2d(px, py, ax, ay, bx, by);
  if (
    distance(ax, ay, projX, projY) < segmentLength &&
    distance(bx, by, projX, projY) < segmentLength
  ) {
    // The projected point is between the two endpoints, so it is on the segment
    // - return the distance from the projected point.
    return distance(px, py, projX, projY);
  } else {
    // The projected point lies outside the segment, so return the distance from
    // the closest endpoint.
    return Math.min(distance(px, py, ax, ay), distance(px, py, bx, by));
  }
}

/**
 * Recursively map a function to all nodes in a tree
 * @param {Object} node - an object with children accessed by .childNodes
 * @param {Function} func - function that takes node as an argument
 */
export function recursiveMap(node, func) {
  node.childNodes.forEach((n) => recursiveMap(n, func));
  func(node);
}

/**
 * Get the Bbox dimensions for an array of text and their rendering sizes
 * @param {RenderingContext} context - the rendering context
 * @param {Array/String} text - array of strings split by line
 * @param {Number} textHeight - height of the font for the text
 * @param {Number} padding - amount of padding, num pixels
 * @return {Object} object with keys: width, height
 */
export function computeBBoxForTextOverlay(context, text, textHeight, padding) {
  const lines = getArrayByLine(text);
  const width = getMaxWidthByLine(context, lines, padding);
  const height = getMaxHeightForText(lines, textHeight, padding);
  return { width, height };
}

/**
 * Get the max height for an array of text lines
 * @param {Array} lines - array of strings split by line
 * @param {Number} textHeight - height of the font for the text
 * @param {Number} padding - amount of padding, num pixels
 * @return {Number} height
 */
export function getMaxHeightForText(lines, textHeight, padding) {
  return lines.length * (textHeight + padding) + padding;
}

/**
 * Get the max width of an array of text lines
 * @param {RenderingContext} context - the rendering context
 * @param {Array} lines - array of strings split by line
 * @param {Number} padding - amount of padding, num pixels
 * @return {Number} width
 */
export function getMaxWidthByLine(context, lines, padding) {
  let maxWidth = 0;
  for (const line of lines) {
    const lineWidth = context.measureText(line).width;
    if (lineWidth === 0) {
      return;
    }
    if (lineWidth > maxWidth) {
      maxWidth = lineWidth;
    }
  }
  return maxWidth + 2 * padding;
}

/**
 * Get text as an array of lines
 * @param {Array/String} text - array of strings split by line
 * @return {Array} width
 */
function getArrayByLine(text) {
  if (Array.isArray(text)) {
    return text;
  }
  return text.split("\n");
}

/**
 * Retrieve the array key corresponding to the smallest element in the array.
 *
 * @param {Array.<number>} array Input array
 * @return {number} Index of array element with smallest value
 */
export function argMin(array) {
  return array.map((x, i) => [x, i]).reduce((r, a) => (a[0] < r[0] ? a : r))[1];
}
