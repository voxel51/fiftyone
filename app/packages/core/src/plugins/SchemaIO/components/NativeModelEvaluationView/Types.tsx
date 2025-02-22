export type OverviewProps = {
  evaluations: EvaluationType[];
  onSelect: (key: string, id: string) => void;
  onEvaluate: () => void;
  statuses?: Record<string, string>;
  notes?: Record<string, string>;
  permissions?: Record<string, boolean>;
  pending_evaluations: PendingEvaluationType[];
};

export type EvaluationType = {
  key: string;
  id: string;
  type: string;
  description: string;
  status: string;
  method?: string;
};

export type PendingEvaluationType = {
  eval_key: string;
  type: string;
  doc_id?: string;
  method?: string;
};

export type EvaluationCardProps = {
  eval_key: string;
  type: string;
  method?: string;
  id?: string;
  note?: string;
  onSelect: OverviewProps["onSelect"];
  pending?: boolean;
  status?: string;
};

export type ConcreteEvaluationType =
  | "classification"
  | "detection"
  | "segmentation"
  | "regression";
