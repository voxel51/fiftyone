export type FileObjectType = {
  absolute_path: string;
  date_modified?: string;
  name?: string;
  size?: number;
  type?: "file" | "directory";
  exists?: boolean;
  parent_path?: string;
};

export type FileSystemObjectType = {
  name: string;
  default_path: string;
};
