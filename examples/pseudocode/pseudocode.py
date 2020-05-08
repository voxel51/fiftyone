"""
Pseudocode for interacting with the FiftyOne tool.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as voxf


# The path to a raw dataset on disk
RAW_DATASET_PATH = "/path/to/my/mscoco/dataset"

# A name for your dataset
DATASET_NAME = "my-mscoco-dataset"

#
# An optional custom backing directory to store the metadata that FiftyOne
# generates for your dataset
#
# The default location is `~/.fiftyone/datasets/<dataset-name>`
#
BACKING_DIR = None


###############################################################################
# Action 0: Launch your dashboard to see what datasets you've played with
###############################################################################

#
# Launches a web dashboard that shows you a dataset listing page
#
# Open localhost:8000 in your browser to use it
#
voxf.launch_dashboard()


###############################################################################
# Action 1: Ingest a raw dataset and visualize it
###############################################################################

#
# `dataset` is an instance of `voxf.core.data.Dataset`, which is the core
# interface that FiftyOne exposes for interacting with datasets.
#
# Datasets can be unlabeled or labeled. They can be image datasets or video
# datasets.
#
dataset = voxf.ingest_dataset(
    RAW_DATASET_PATH,
    name=DATASET_NAME,
    format=voxf.types.datasets.MSCOCO,
    backing_dir=BACKING_DIR,
)

# Print details about the dataset
print("Dataset name: %s" % dataset.name)
print("Backing directory: %s" % dataset.backing_dir)
print("Number of samples: %d" % dataset.num_samples)

#
# Launches a web dashboard that drops you on the Explore Tab of your dataset
#
# You can use the Explore Tab to view macro-level statistics about the dataset
# such as number of samples, data size, etc. You can also view individual
# samples in the dataset
#
# Open localhost:8000 in your browser to use it
#
voxf.launch_dashboard(dataset=dataset)


###############################################################################
# Action 2: Compute data diversity on a dataset
###############################################################################

#
# Creates an interface to a previously ingested dataset of the given name
#
# Alternatively you can load a dataset by directly specifying its `backing_dir`
#
dataset = voxf.load_dataset(name=DATASET_NAME)

#
# Index the samples by diversity. This dumps information into the
# `BACKING_DIR` for the dataset
#
# Example algorithm: use an OOTB deep model to featurize the frames, and
# generate a hierarchical clustering of the samples for subsequent use to
# select a diverse subset of the data of a requested size
#
index_id = dataset.index_samples_by_diversity()
#
# Crunch crunch crunch... indexing takes some time. Maybe it spawns a
# background task whose progress you can monitor via the web dashboard? maybe
# it executes synchronously?
#

#
# Visualize the dataset again, which will now contain a Diversity Tab where
# you can visualize the diversity information that was added to the
# dataset
#
voxf.launch_dashboard(dataset=dataset)

#
# Select a maximally diverse set of samples of size `num_samples` using the
#
# Samples is an instance of `voxf.core.data.DatasetView`, which provides an
# interface for iterating over the samples in the view. FiftyOne provides
# `DatasetView`s for all common data formats. For example, the command below
# will return a view that implements Pytorch's dataset interface so that the
# samples can be directly ingested into a Pytorth model. Other possibilities
# are to return an iterator in `tf.Record` format, for example
#
samples = dataset.select_samples(
    index=index_id,
    #
    # This instructs FiftyOne to select a maximal covering set of samples
    # according to `index_id`
    #
    method="max-covering",
    num_samples=100,
    format=voxf.types.datasets.PytorchImageDataset,
)

#
# Iterate over the samples
#
# Each `sample` is an instance of `voxf.core.data.Sample`
#
for sample in samples:
    # `data_path` is the path to the sample on local disk
    print("Data path: %s" % sample.data_path)
    print("Labels: %s" % sample.labels)

#
# Export the samples as a dataset in local disk that you can take and use
# for your own purposes
#
# This time, we'll export in `eta.core.datasets.LabeledImageDataset` format!
#
samples.export(
    "/path/for/export", format=voxf.types.datasets.LabeledImageDataset,
)


###############################################################################
# Action 3: Register ground truth predictions on a dataset
###############################################################################

dataset = voxf.load_dataset(name=DATASET_NAME)

#
# Iterate over all samples in the dataset and register ground truth predictions
# for the dataset
#
for sample in dataset.all_samples():
    prediction = get_prediction(...)  # get the prediction for the sample
    sample.add_ground_truth({"prediciton": prediciton})

#
# The Explore Tab will now contain the ground truth labels and you can use the
# interface to search by label, visualize rendered annotations, etc
#
voxf.launch_dashboard(dataset=dataset)


###############################################################################
# Action 4: Register model predictions on a dataset
###############################################################################

dataset = voxf.load_dataset(name=DATASET_NAME)

# Load your model, whatever it is
model = load_model(...)

# Register the model with the dataset
model_id = dataset.register_model(model, ...)

#
# Perform prediciton on all samples in the dataset, and add this information
# to the FiftyOne dataset
#
for sample in dataset.all_samples():
    img = load_image(sample.data_path)

    result = model.predict(img)

    sample.add_model_prediction(
        {
            "model_id": model_id,
            "prediction": result.prediction,
            "confidence": result.confidence,
            "logits": result.logits,
        }
    )

#
# Visualize the dataset again, which will now contain a Prediction tab in the
# visualizer, where you can:
#   - sort predictions by confidence
#   - find best and worst predictions, and visualize them
#   - visualize evaluation metrics w.r.t. the ground truth annotations
#
# This data may also be accessed programmatically via the client library
#
voxf.launch_dashboard(dataset=dataset)


###############################################################################
# Action 5: Use a model to select new samples to annotate
###############################################################################

dataset = voxf.load_dataset(name=DATASET_NAME)

model = load_model(...)

#
# Index the unlabeled samples in the dataset by running inference on the model
#
index_id = dataset.index_unlabeled_samples(model=model)

samples = dataset.select_samples(
    index=index_id,
    #
    # This instructs FiftyOne to select the samples with the max score in
    # `index_id`
    #
    method="max",
    num_samples=10,
    format=voxf.types.datasets.MSCOCO,
)

#
# Iterate over the samples recommended by the index
#
# What do you do with these 10 samples? Well you, offline, do the following:
#   - Send samples for annotation
#   - Run inference on the model and ingest into FiftyOne via Action 4
#   - Repeat...
#
for sample in samples:
    print("Data path: %s" % sample.data_path)
