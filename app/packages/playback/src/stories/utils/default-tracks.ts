import type { Track } from "../../lib/TrackProvider";

/**
 * Mocked semantic tracks for demo stories. Each track represents the
 * output of an "extract this concept from these topics" pipeline that
 * would, in a real ingestion path, run against the source MCAP. For
 * now the events are hand-rolled so the timeline UI has something
 * meaningful to render and click through.
 *
 * Track ids are stable so a story can choose which ones are pinned by
 * default — typically the thing the user searched for to get here.
 */
export const DEFAULT_TRACKS: Track[] = [
  {
    id: "cat_detected",
    label: "Cat in frame",
    description: "Front-camera frames with a detected `cat` class",
    color: "#4a9eff",
    events: [
      { startSec: 1.2, endSec: 2.8, label: "Tabby on the left curb" },
      { startSec: 5.1, endSec: 6.7, label: "Black cat dashes across" },
    ],
  },
  {
    id: "hard_decel",
    label: "Hard deceleration",
    description: "IMU acceleration below -3 m/s²",
    color: "#ff7c4a",
    events: [
      { startSec: 3.4, label: "−4.1 m/s²" },
      { startSec: 8.2, label: "−5.6 m/s²" },
    ],
  },
  {
    id: "collision",
    label: "Collision",
    description:
      "Impact detected via IMU spike + bumper contact sensor agreement",
    color: "#ff4a6e",
    events: [
      {
        startSec: 7.0,
        endSec: 7.5,
        label: "Side-impact, right rear",
      },
    ],
  },
  {
    id: "lane_change",
    label: "Lane change",
    description: "Detected from steering angle + lateral acceleration",
    color: "#ffd24a",
    events: [
      { startSec: 4.5, label: "Right → center" },
      { startSec: 9.6, label: "Center → left" },
    ],
  },
  {
    id: "gps_lost",
    label: "GPS signal lost",
    description: "GPS fix quality below acceptable threshold",
    color: "#a0a0a0",
    events: [
      { startSec: 9.0, endSec: 11.5, label: "Indoor tunnel section" },
    ],
  },
  {
    id: "person_in_path",
    label: "Person in path",
    description: "Pedestrian detected inside the planned trajectory",
    color: "#9b7cff",
    events: [{ startSec: 6.4, endSec: 6.9, label: "Pedestrian crossing" }],
  },
];

/**
 * Track ids that come pinned by default. Intentionally narrow — the
 * point of a search-driven demo is to land on a view that highlights
 * what the user was looking for, with everything else available but
 * not in the way.
 */
export const DEFAULT_PINNED_TRACK_IDS: string[] = [
  "collision",
  "hard_decel",
];
