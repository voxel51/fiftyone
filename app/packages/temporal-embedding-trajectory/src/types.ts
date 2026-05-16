export type BrainKeyInfo = {
  key: string;
  method?: string | null;
  model?: string | null;
  num_dims?: number;
};

export type SceneTrajectory = {
  sample_id: string;
  brain_key: string;
  points: Array<[number, number]>;
  frame_numbers: number[];
  frame_ids: string[];
  jump_dists: number[];
};

export type TrajectoryPanelData = {
  brain_keys?: BrainKeyInfo[];
  scene_trajectory?: SceneTrajectory | null;
  compare_trajectories?: Record<string, SceneTrajectory>;
  frame_media?: Record<string, string>;
};

export type TrajectoryViewSchema = {
  view: {
    list_brain_keys: string;
    get_scene_trajectory: string;
    get_compare_trajectories: string;
    get_frame_media: string;
    compute_trajectory: string;
    seek_to_frame: string;
  };
};

export type ViewMode = "scatter" | "compare";

export type TrajectoryViewProps = {
  schema: TrajectoryViewSchema;
  data?: TrajectoryPanelData;
};
