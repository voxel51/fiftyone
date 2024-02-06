"""
Utilities for working with
`Hugging Face Hub <hhttps://huggingface.co/docs/huggingface_hub>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import shutil

# import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.types as fot
import huggingface_hub as hfh

DATASET_CONTENT_TEMPLATE = """

This is a [FiftyOne](https://github.com/voxel51/fiftyone) dataset with {num_samples} samples.

```plaintext
{dataset_printout}
```

## Installation
If you haven't already, install FiftyOne:

```bash
pip install fiftyone
```

## Usage

```python
import fiftyone as fo
import fiftyone.utils.huggingface_hub as fouh

# Load the dataset
dataset = fouh.load_from_hub("{repo_id}")

# Launch the App
session = fo.launch_app(dataset)
```
"""


def _get_dataset_tasks(dataset):
    """Get the tasks that can be performed on the given dataset."""

    def _has_label(ftype):
        return (
            len(list(dataset.get_field_schema(embedded_doc_type=ftype).keys()))
            > 0
        )

    tasks = []
    if _has_label(fol.Classification) or _has_label(fol.Classifications):
        tasks.append("image-classification")
    if _has_label(fol.Detections):
        tasks.append("object-detection")
    if _has_label(fol.Segmentation):
        tasks.append("semantic-segmentation")
    return tasks


def _get_dataset_tags(dataset):
    """Get the tags of the given dataset."""
    tags = ["fiftyone"]
    tags.append(dataset.media_type)
    tags.extend(dataset.tags)
    return sorted(list(set(tags)))


def _generate_dataset_summary(repo_id, dataset):
    """Generate a summary of the given dataset."""
    return DATASET_CONTENT_TEMPLATE.format(
        dataset_printout=dataset.__repr__(),
        num_samples=len(dataset),
        repo_id=repo_id,
    )


def _create_dataset_card(repo_id, dataset, **dataset_card_kwargs):
    """Create a `DatasetCard` for the given dataset."""

    card_inputs = {
        "language": "en",
        "annotations_creators": [],
        "task_categories": _get_dataset_tasks(dataset),
        "task_ids": [],
        "pretty_name": dataset.name,
        "license": None,
        "tags": _get_dataset_tags(dataset),
    }

    for key, value in dataset_card_kwargs.items():
        card_inputs[key] = value

    dataset_summary = _generate_dataset_summary(repo_id, dataset)
    if dataset_summary is not None:
        card_inputs["dataset_summary"] = dataset_summary

    card_data = hfh.DatasetCardData(**card_inputs)
    return hfh.DatasetCard.from_template(card_data)


def push_to_hub(dataset, repo_name, private=True, **data_card_kwargs):
    ### export the dataset to a temp local dir
    tmp_dir = f"/tmp/{repo_name}"

    dataset.export(
        export_dir=tmp_dir,
        dataset_type=fot.FiftyOneDataset,
        export_media=True,
    )

    hf_username = hfh.whoami()["name"]

    ## Create the dataset repo
    repo_id = os.path.join(hf_username, repo_name)
    hfh.create_repo(repo_id, repo_type="dataset", private=private)

    ## Upload the dataset to the repo
    api = hfh.HfApi()

    api.upload_folder(
        folder_path=tmp_dir,
        repo_id=repo_id,
        repo_type="dataset",
    )

    ## Create the dataset card
    card = _create_dataset_card(repo_id, dataset, **data_card_kwargs)
    card.push_to_hub(repo_id)

    ## Clean up
    shutil.rmtree(tmp_dir)
