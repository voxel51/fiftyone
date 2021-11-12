"""
Utilities for working with the
`Families In the Wild dataset <https://web.northeastern.edu/smilelab/fiw/>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
from collections import defaultdict
from pathlib import Path

import eta.core.utils as etau
import eta.core.web as etaw
import pandas as pd

import fiftyone as fo
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def download_fiw_dataset(dataset_dir, scratch_dir=None, cleanup=True):
    """Downloads and extracts the Families in the Wild dataset.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to output the final dataset
        scratch_dir (None): a scratch directory to use to store temporary files
        cleanup (True): whether to cleanup the scratch directory after
            extraction
    """
    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    # Download dataset
    images_dir = _download_images(scratch_dir)
    test_path, val_path, train_path = _download_splits(scratch_dir)

    # Reorganize files into splits
    logger.info("Images and lists are ready!")
    logger.info(
        f"Images: {images_dir}\nTrain: {train_path}\nVal: {val_path}"
        f"\nTest: {test_path}"
    )

    if cleanup:
        logger.info(f"Cleaning up {scratch_dir}")
        etau.delete_dir(scratch_dir)
    return scratch_dir

    return scratch_dir


_IMAGES_DOWNLOAD_LINK = "1rkrDGOjS0e_pptzRHZl5bRGq0yy5xQxQ"
_MD5_DATA_DOWNLOAD_LINK = "121lbbeaiY-qM2tK9sJXWNuvMczVuwi2p"
_LISTS_DOWNLOAD_LINK = "1nt22yiCfdGF7aIguUb-SJmsM_1CvcYjg"
_MD5_LISTS_DOWNLOAD_LINK = "1nt22yiCfdGF7aIguUb-SJmsM_1CvcYjg"


def _download_images(scratch_dir):
    zip_path = os.path.join(scratch_dir, "data.zip")
    images_dir = os.path.join(scratch_dir, "fiw")

    if not os.path.exists(zip_path):
        logger.info("Downloading dataset to '%s'", zip_path)
        etaw.download_google_drive_file(_IMAGES_DOWNLOAD_LINK, path=zip_path)
    else:
        logger.info("File '%s' already exists", zip_path)

    logger.info("Unpacking images...")
    etau.extract_zip(zip_path, outdir=scratch_dir, delete_zip=False)

    return images_dir


def _download_splits(scratch_dir):
    zip_path = Path(scratch_dir) / "lists.zip"
    if not zip_path.exists():
        logger.info(f"Downloading split info to '{zip_path}'")
        etaw.download_google_drive_file(_LISTS_DOWNLOAD_LINK, path=zip_path)

    else:
        logger.info(f"Directory '{zip_path}' already exists")

    logger.info("Unpacking images...")
    etau.extract_zip(zip_path, outdir=scratch_dir, delete_zip=False)

    list_path = Path(str(zip_path).replace(".zip", ""))
    test_path = list_path / "test.csv"
    val_path = list_path / "val.csv"
    train_path = list_path / "train.csv"

    return test_path, val_path, train_path


def _load_split_info(split_path):
    return pd.read_csv(split_path)


def get_data(dataset_dir, data_split="test"):
    etau.ensure_dir(dataset_dir)
    dir_contents = os.listdir(dataset_dir)
    if "lists" not in dir_contents:
        list_path = os.path.join(dataset_dir, "lists.zip")
        etaw.download_google_drive_file(
            "1nt22yiCfdGF7aIguUb-SJmsM_1CvcYjg", path=list_path
        )
        etau.extract_zip(list_path)

    if data_split not in dir_contents:
        data_path = os.path.join(dataset_dir, "data.zip")
        etaw.download_google_drive_file(
            "1rkrDGOjS0e_pptzRHZl5bRGq0yy5xQxQ", path=data_path
        )
        etau.extract_zip(data_path)


def load_split(split, base_dir):
    samples = []
    split_dir = os.path.join(base_dir, split)
    for family in etau.list_subdirs(split_dir):
        family_dir = os.path.join(base_dir, split, family)
        labels = pd.read_csv(os.path.join(split_dir, family, "mid.csv"))
        for member in etau.list_subdirs(family_dir):
            imgs_dir = os.path.join(family_dir, member)
            if "MID" in member:
                samples.extend(
                    load_member(imgs_dir, split, family, member, labels)
                )
            else:
                samples.extend(load_unrelated(imgs_dir, split, family))

    return samples


def load_unrelated(imgs_dir, split, family):
    samples = []
    for img in os.listdir(imgs_dir):
        sample = fo.Sample(filepath=os.path.join(imgs_dir, img))
        sample["family"] = family
        sample["member"] = None
        sample.tags.append(split)
        samples.append(sample)
    return samples


def load_member(dir_images, data_split, family_id, member_id, labels):
    """
    Load the MID 'member' of FID 'family' with images in directory.
    :param dir_images:
    :param data_split:
    :param family_id:
    :param member_id:
    :param labels:
    :return:
    """
    samples = []
    member_id = get_mid(member_id)
    name = get_name(labels, member_id)
    gender = get_gender(labels, member_id)
    for img in os.listdir(dir_images):
        sample = fo.Sample(filepath=os.path.join(dir_images, img))
        sample["family"] = family_id
        sample["member"] = member_id
        sample["member_id"] = member_id
        sample["name"] = name
        sample["gender"] = gender
        if data_split == "train":
            sample["identifier"] = f"{family_id}/{member_id}"
        else:
            sample["identifier"] = f"{family_id}/{member_id}/{img}"
        sample["relationships"] = fo.Classifications(classifications=[])
        sample.tags.append(data_split)
        samples.append(sample)
    return samples


def get_mid(member_id):
    """
    Parse MID string.
    :param member_id:
    :return: int value proceeding MID, i.e., (x in MIDx)
    """
    return int(member_id.replace("MID", ""))


def get_name(labels, member_id):
    names = labels["Name"]
    if len(names) >= member_id:
        name = names[member_id - 1]
    else:
        name = None
    return name


def get_gender(labels, member_id):
    genders = labels["Gender"]
    if len(genders) >= member_id:
        gender = genders[member_id - 1]
    else:
        gender = None
    return gender


def parse_relationships(
    dataset_ref, data_split, dir_data, max_n_relationships=None
):
    split_filepath = os.path.join(dir_data, "lists", f"{data_split}.csv")
    split_list = pd.read_csv(split_filepath)
    id_map = get_id_map(dataset_ref)
    values_map = defaultdict(list)

    cnt = 0
    with fou.ProgressBar(total=len(split_list)) as pb:
        for row_id, row in pb(split_list.iterrows()):
            p1 = row["p1"]
            p2 = row["p2"]

            pair_type = row["ptype"] if "ptype" in row else row["tags"]
            if not pair_type:
                pair_type = "not related"

            for sample_id in id_map[p1]:
                sample1 = dataset_ref[sample_id]
                cls1 = fo.Classification(
                    label=str(pair_type),
                    p1_id=sample1.id,
                    p1=p1,
                    p1_mid=sample1.member_id,
                )
                for sample_id_2 in id_map[p2]:
                    if sample_id != sample_id_2:
                        sample2 = dataset_ref[sample_id_2]
                        cls2 = fo.Classification(
                            label=str(pair_type),
                            p2_id=sample2.id,
                            p2=p2,
                            p2_mid=sample2.member_id,
                        )
                        values_map[sample_id].append(cls2)
                        if data_split != "train":
                            values_map[sample_id_2].append(cls1)
                    cnt += 1
            if max_n_relationships and cnt > max_n_relationships:
                break

    classifications = []
    for sample_id in dataset_ref.values("id"):
        classifications.append(values_map[sample_id])
    dataset_ref.set_values("relationships.classifications", classifications)


def get_id_map(dataset):
    id_map = defaultdict(list)
    ids, identifiers = dataset.values(["id", "identifier"])
    for sample_id, identifier in zip(ids, identifiers):
        id_map[identifier].append(sample_id)
    return id_map


def prepare_dataset(
    dir_scratch="/tmp/fiw_test/",
    data_split="test",
    overwrite=True,
    data_ref="FIW",
    max_relationships=1000,
):
    """

    :param dir_scratch:
    :param data_split:  Available splits: ["train", "val", "test", "all"]
    :param overwrite:
    :param data_ref:
    :param max_relationships:
    :return:
        dataset parsed out with family IDs, member IDs, and relationship types
    """
    if overwrite and data_ref in fo.list_datasets():
        fo.delete_dataset("FIW")

    dataset = fo.Dataset("FIW")

    logger.info(f"Loading split {data_split}")
    dataset.add_samples(load_split(data_split, dir_scratch))
    parse_relationships(
        dataset, data_split, dir_scratch, max_n_relationships=max_relationships
    )
    return dir_scratch
