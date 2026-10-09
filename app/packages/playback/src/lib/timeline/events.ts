/** Commands to a timeline, each naming the timeline it is for */
export type TimelineEvents = {
  "timeline:play": { timelineName: string };
  "timeline:pause": { timelineName: string };
  "timeline:seek": { timelineName: string; start: boolean };
  "timeline:set-frame-number": { timelineName: string; frameNumber: number };
};
