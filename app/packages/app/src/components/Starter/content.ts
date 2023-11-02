const SELECT_DATASET_CODE = `import fiftyone as fo

# Name of an existing dataset
name = "quickstart"

dataset = fo.load_dataset(name)

# if you do not have an active app session
session = fo.launch_app(dataset)

# if you already have an active app session
# session.dataset = dataset`;

const ADD_SAMPLE_CODE = `import fiftyone as fo

# Name of an existing dataset
name = "quickstart"

dataset = fo.load_dataset(name)

# add a new image sample to the dataset
dataset.add_sample(fo.Sample(filepath="/path/to/image.png"))`;

const ADD_DATASET_CODE = `import fiftyone as fo

# A name for the dataset
name = "my-dataset"

# The directory containing the dataset to import
dataset_dir = "/path/to/dataset"

# The type of the dataset being imported
dataset_type = fo.types.COCODetectionDataset  # for example

dataset = fo.Dataset.from_dir(
    dataset_dir=dataset_dir,
    dataset_type=dataset_type,
    name=name,
)`;

export const CONTENT_BY_MODE = {
  SELECT_DATASET: {
    title: "No dataset selected",
    code: SELECT_DATASET_CODE,
    subtitle: "Select a dataset with dataset selector above or",
    codeTitle: "Select a dataset with code",
    codeSubtitle:
      "Use Python or command line tools to set dataset for the current session",
    learnMoreLink: "https://docs.voxel51.com/user_guide/app.html",
    learnMoreLabel: "about using the Fiftyone App",
  },
  ADD_SAMPLE: {
    title: "No samples yet",
    code: ADD_SAMPLE_CODE,
    subtitle: "Add samples to this dataset with code or",
    codeTitle: "Add samples with code",
    codeSubtitle:
      "Use Python or command line tools to add sample to this dataset",
    learnMoreLink: "https://docs.voxel51.com/user_guide/using_datasets.html",
    learnMoreLabel: "about using Fiftyone dataset",
  },
  ADD_DATASET: {
    title: "No datasets yet",
    code: ADD_DATASET_CODE,
    subtitle: "Add a dataset to FiftyOne with code or",
    codeTitle: "Add dataset with code",
    codeSubtitle: "Use Python or command line tools to add dataset to FiftyOne",
    learnMoreLink:
      "https://docs.voxel51.com/user_guide/dataset_creation/index.html",
    learnMoreLabel: "about loading data into FiftyOne",
  },
};
