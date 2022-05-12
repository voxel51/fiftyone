"""
Utilities for working with the
`Families in the Wild dataset <https://web.northeastern.edu/smilelab/fiw/>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
from collections import defaultdict

import eta.core.utils as etau
import eta.core.web as etaw
import pandas as pd

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

from fiftyone.core.expressions import ViewField as F
from fiftyone.core.expressions import VALUE


logger = logging.getLogger(__name__)


class FIWDatasetImporter(foud.BatchDatasetImporter):
    """Importer for Faces in the Wild-formatted datasets stored on disk.

    See
    `this page <https://github.com/visionjo/pykinship#db-contents-and-structure>`_
    for format details.

    """

    def import_samples(self, dataset, tags=None):
        """Imports samples and labels stored on disk following the format of
        the Families in the Wild dataset.

        Args:
            dataset: a :class:`fiftyone.core.dataset.Dataset`
            tags (None): an optional list of tags to attach to each sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        prev_ids = set(dataset.values("id"))

        labels_path = os.path.join(self.dataset_dir, "labels.csv")
        data_path = os.path.join(self.dataset_dir, "data")

        logger.info("Parsing relationships and adding samples...")
        samples = _load_split(data_path, tags, labels_path)
        dataset.add_samples(samples)

        return sorted(set(dataset.values("id")) - prev_ids)


def get_pairwise_labels(samples, label_type="kinships"):
    """Gets a list of all pairs of people that are related and the label of
    their relation, either through the "kinships" or "relationships" field.

    Example::

        [
           ["F0009/MID2", "F0009/MID4", "sibling"],
           ...
        ]

    Args:
        samples: a
            :class:`fiftyone.core.collections.SampleCollection`
        label_type ("kinships"): the type of label of which to return pairwise
            listings options are ``("kinships", "relationships")``

    Returns:
        a list of triplets containing the identifier of person 1, identifier of
        person 2, and their kinship or relationship
    """
    supported_types = ("kinships", "relationships")
    if label_type not in supported_types:
        raise ValueError(
            "Invalid label_type=%s. The supported values are %s"
            % (label_type, supported_types)
        )

    return samples.values(
        F("%s.classifications" % label_type).reduce(
            VALUE.append(
                [
                    F("family").concat("/", F("member_id")),
                    F("$identifier"),
                    F("label"),
                ]
            ),
            init_val=[],
        ),
        unwind=True,
    )


def get_identifier_filepaths_map(samples):
    """Creates a mapping of ``family_id/member_id`` identifier to a list of
    filepaths for each person.

    Example::

        {
            "F0325/MID4": [
                "/path/to/fiftyone/fiw/train/data/F0325/MID4/P03451_face4.jpg",
                ...
            ],
            ...
        }

    Args:
        samples: a
            :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a dict mapping ``family_id/member_id`` identifiers to a list of
        filepaths containing images of the corresponding person
    """
    id_map = defaultdict(list)
    id_fp_list = list(zip(*samples.values([F("identifier"), F("filepath")])))
    for identifier, fp in id_fp_list:
        id_map[identifier] = fp

    return dict(id_map)


def _load_split(split_dir, tags, labels_path):
    samples = []
    face_indices = defaultdict(lambda: 0)
    kinship_map = _parse_kinship_map(labels_path)

    subdirs = etau.list_subdirs(split_dir)
    with fou.ProgressBar(subdirs) as pb:
        for family in pb(subdirs):
            family_dir = os.path.join(split_dir, family)
            labels = pd.read_csv(os.path.join(split_dir, family, "mid.csv"))
            for member in etau.list_subdirs(family_dir):
                imgs_dir = os.path.join(family_dir, member)
                if "MID" in member:
                    samples.extend(
                        _load_member(
                            imgs_dir,
                            family,
                            member,
                            labels,
                            face_indices,
                            tags,
                            kinship_map,
                        )
                    )

    return samples


def _load_member(
    dir_images, family_id, member_id, labels, face_indices, tags, kinship_map
):
    samples = []
    num_members = labels.shape[0]
    member_id_int = _get_mid(member_id)
    name = _get_name(labels, member_id_int)
    gender = _get_gender(labels, member_id_int)
    imgs_list = os.listdir(dir_images)
    rels = _get_relationships(labels, member_id_int, num_members, family_id)

    for img in imgs_list:
        sample = fo.Sample(filepath=os.path.join(dir_images, img), tags=tags)
        picture, face = _get_picture_face(img)
        sample["family"] = family_id
        sample["member_id"] = member_id_int
        sample["member"] = member_id
        sample["name"] = name
        sample["gender"] = gender
        sample["picture"] = picture
        sample["face"] = face

        identifier = "%s/%s" % (family_id, member_id)
        sample["identifier"] = identifier
        sample["face_id"] = face_indices[identifier]
        face_indices[identifier] += 1

        sample["relationships"] = fo.Classifications(classifications=rels)

        kinships = []
        for pair_type, kin_identifiers in kinship_map.get(
            identifier, {}
        ).items():
            for kin_id in kin_identifiers:
                kin_fid, kin_mid = kin_id.split("/")
                kinships.append(
                    fo.Classification(
                        label=str(pair_type),
                        member_id=kin_mid,
                        family=kin_fid,
                    )
                )

        sample["kinships"] = fo.Classifications(classifications=kinships)
        samples.append(sample)

    return samples


def _get_relationships(labels, member_id_int, num_members, family_id):
    rels = []
    member_labels = labels.loc[labels["MID"] == member_id_int].values
    if len(member_labels) == 0:
        return rels

    member_labels = member_labels[0][1:]
    for mid, rel_int in enumerate(member_labels):
        if mid >= num_members:
            break

        if rel_int not in _RELATIONSHIP_MAP.keys():
            continue

        rel_type = _RELATIONSHIP_MAP[rel_int]
        rel = fo.Classification(
            label=rel_type,
            member_id=_format_mid(mid),
            family=family_id,
        )
        rels.append(rel)

    return rels


def _get_picture_face(img_path):
    filename = os.path.splitext(os.path.basename(img_path))[0]
    return filename.split("_")


def _get_mid(member_id):
    return int(member_id.replace("MID", ""))


def _format_mid(member_id_int):
    return "MID" + str(member_id_int)


def _get_name(labels, member_id):
    names = labels["Name"]
    if len(names) >= member_id:
        return names[member_id - 1]

    return None


def _get_gender(labels, member_id):
    genders = labels["Gender"]
    if len(genders) >= member_id:
        return genders[member_id - 1]

    return None


def _parse_kinship_map(labels_path):
    split_list = pd.read_csv(labels_path)
    kinship_map = defaultdict(lambda: defaultdict(set))

    pairs = split_list[["p1", "p2", "ptype"]].value_counts().keys()
    for p1, p2, ptype in pairs:
        p1 = _parse_identifier(p1)
        p2 = _parse_identifier(p2)
        kinship_map[p1][ptype].add(p2)
        kinship_map[p2][ptype].add(p1)

    return dict(kinship_map)


def _parse_identifier(identifier):
    id_parts = identifier.split("/")
    if len(id_parts) not in [2, 3]:
        raise ValueError("Invalid identifier found: '%s'" % identifier)

    return "/".join(id_parts[:2])


def download_fiw_dataset(dataset_dir, split, scratch_dir=None, cleanup=False):
    """Downloads and extracts the Families in the Wild dataset.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to output the final dataset
        split: the split being loaded
        scratch_dir (None): a scratch directory to use to store temporary files
        cleanup (True): whether to cleanup the scratch directory after
            extraction
    """
    etau.ensure_dir(dataset_dir)

    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")
        etau.ensure_dir(scratch_dir)

    # Download dataset
    _download_images_if_necessary(dataset_dir, scratch_dir)
    _download_labels_if_necessary(dataset_dir, scratch_dir)

    if cleanup:
        logger.info("Cleaning up %s", scratch_dir)
        etau.delete_dir(scratch_dir)

    num_samples, classes = _get_dataset_info(dataset_dir, split)

    return num_samples, classes


def _download_images_if_necessary(dataset_dir, scratch_dir):
    if _is_missing_images(dataset_dir):
        zip_path = os.path.join(scratch_dir, "data.zip")
        unzip_path = os.path.join(scratch_dir, "data")

        if not os.path.exists(zip_path):
            logger.info("Downloading data to '%s'", zip_path)
            etaw.download_google_drive_file(
                _IMAGES_DOWNLOAD_LINK, path=zip_path
            )

        logger.info("Unpacking images...")
        etau.extract_zip(zip_path, outdir=unzip_path, delete_zip=False)
        _organize_data(unzip_path, dataset_dir)


def _is_missing_images(dataset_dir):
    for split in _SPLITS:
        if not os.path.isdir(os.path.join(dataset_dir, split, "data")):
            return True

    return False


def _organize_data(unzip_path, dataset_dir):
    for split in _SPLITS:
        split_unzip_path = os.path.join(unzip_path, split)
        split_data_dir = os.path.join(dataset_dir, split, "data")
        etau.ensure_dir(split_data_dir)
        etau.move_dir(split_unzip_path, split_data_dir)


def _is_missing_labels(dataset_dir):
    required_files = [os.path.join(dataset_dir, "splits.csv")]

    for split in _SPLITS:
        required_files.append(os.path.join(dataset_dir, split, "labels.csv"))

    for f in required_files:
        if not os.path.isfile(f):
            return True

    return False


def _download_labels_if_necessary(dataset_dir, scratch_dir):
    if _is_missing_labels(dataset_dir):
        zip_path = os.path.join(scratch_dir, "lists.zip")
        if not os.path.exists(zip_path):
            logger.info("Downloading labels to '%s'", zip_path)
            etaw.download_google_drive_file(
                _LISTS_DOWNLOAD_LINK, path=zip_path
            )

        logger.info("Unpacking labels...")
        etau.extract_zip(zip_path, outdir=scratch_dir, delete_zip=False)
        _organize_labels(scratch_dir, dataset_dir)


def _organize_labels(scratch_dir, dataset_dir):
    for split in _SPLITS:
        source_path = os.path.join(scratch_dir, "lists", split + ".csv")
        split_dir = os.path.join(dataset_dir, split)
        etau.ensure_dir(split_dir)
        destination_path = os.path.join(dataset_dir, split, "labels.csv")
        etau.move_file(source_path, destination_path)

    splits_source = os.path.join(scratch_dir, "lists", "splits.csv")
    splits_destination = os.path.join(dataset_dir, "splits.csv")
    etau.move_file(splits_source, splits_destination)


def _get_dataset_info(dataset_dir, split):
    splits_file = os.path.join(dataset_dir, "splits.csv")
    splits_df = pd.read_csv(splits_file)
    split_img_glob = os.path.join(
        dataset_dir, split, "data", "*", "*", "*.jpg"
    )
    num_samples = len(etau.get_glob_matches(split_img_glob))
    return num_samples, sorted(splits_df["FID"].unique())


_SPLITS = ["train", "test", "val"]

_RELATIONSHIP_MAP = {
    1: "child",
    2: "sibling",
    3: "grandchild",
    4: "parent",
    5: "spouse",
    6: "grandparent",
    7: "great grandchild",
    8: "great grandparent",
    9: "TBD",
}

_IMAGES_DOWNLOAD_LINK = "1rkrDGOjS0e_pptzRHZl5bRGq0yy5xQxQ"
_MD5_DATA_DOWNLOAD_LINK = "121lbbeaiY-qM2tK9sJXWNuvMczVuwi2p"
_LISTS_DOWNLOAD_LINK = "1nt22yiCfdGF7aIguUb-SJmsM_1CvcYjg"
_MD5_LISTS_DOWNLOAD_LINK = "1nt22yiCfdGF7aIguUb-SJmsM_1CvcYjg"
