"""
Utilities for working with the
`Families in the Wild dataset <https://web.northeastern.edu/smilelab/fiw/>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import shutil
import random
from collections import Counter, defaultdict

import eta.core.utils as etau
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

    def import_samples(self, dataset, tags=None, progress=None):
        """Imports samples and labels stored on disk following the format of
        the Families in the Wild dataset.

        Args:
            dataset: a :class:`fiftyone.core.dataset.Dataset`
            tags (None): an optional list of tags to attach to each sample
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``

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


def parse_fiw_dataset(source_dir, dataset_dir, split):
    """Parses the manually downloaded FIW dataset.

    Args:
        source_dir: the directory containing the manually downloaded FIW files
        dataset_dir: the directory to output the final dataset
        split: the split to prepare

    Returns:
        a tuple of (num_samples, classes)
    """
    _validate_source_dir(source_dir)
    etau.ensure_dir(dataset_dir)
    _organize_fiw_data(source_dir, dataset_dir)
    return _get_dataset_info(dataset_dir, split)


def download_fiw_dataset(dataset_dir, split, source_dir=None):
    """Downloads and extracts the Families in the Wild dataset.

    Note:
        This dataset requires manual download. You must register at
        https://fulab.sites.northeastern.edu/fiw-download/ and download
        the data before using this function.

    Args:
        dataset_dir: the directory to output the final dataset
        split: the split being loaded
        source_dir (None): the directory containing the manually downloaded
            FIW files

    Returns:
        a tuple of (num_samples, classes)
    """
    return parse_fiw_dataset(source_dir, dataset_dir, split)


def _validate_source_dir(source_dir):
    if source_dir is None:
        _raise_fiw_error(
            "You must provide a `source_dir` in order to load the FIW dataset."
        )

    if not os.path.isdir(source_dir):
        _raise_fiw_error(
            "Source directory '%s' does not exist." % source_dir
        )

    contents = os.listdir(source_dir)

    if "train-faces" not in contents:
        _raise_fiw_error(
            "Required directory 'train-faces' not found in '%s'." % source_dir
        )

    if "train_relationships.csv" not in contents:
        _raise_fiw_error(
            "Required file 'train_relationships.csv' not found in '%s'." % source_dir
        )

    test_faces_found = (
        "test-public-faces" in contents
        or os.path.isdir(os.path.join(source_dir, "test-public-faces", "test-public-faces"))
    )
    if not test_faces_found:
        _raise_fiw_error(
            "Required directory 'test-public-faces' not found in '%s'." % source_dir
        )

    test_lists_found = (
        "test-public-lists" in contents
        or os.path.isdir(os.path.join(source_dir, "test-public-lists", "test-public-lists"))
    )
    if not test_lists_found:
        _raise_fiw_error(
            "Required directory 'test-public-lists' not found in '%s'." % source_dir
        )


def _raise_fiw_error(msg):
    raise OSError(
        "\n\n"
        + msg
        + "\n\n"
        + "You must download the FIW dataset manually from the official source.\n\n"
        + "1. Register at: https://docs.google.com/forms/d/e/1FAIpQLSd5_hbg-7QlrqE9V4MJShgww308yCxHlj6VOLctETX6aYLQgg/viewform\n"
        + "2. Download and extract the dataset\n"
        + "3. Pass the extraction directory as `source_dir`\n\n"
        + "More info: https://fulab.sites.northeastern.edu/fiw-download/\n"
        + "Run `fiftyone zoo datasets info fiw` for more information"
    )


def _organize_fiw_data(source_dir, dataset_dir):
    """Organizes FIW source data into fiftyone expected structure."""
    if not _is_missing_images(dataset_dir) and not _is_missing_labels(dataset_dir):
        return

    test_public_lists = os.path.join(source_dir, "test-public-lists")
    if os.path.isdir(os.path.join(test_public_lists, "test-public-lists")):
        test_public_lists = os.path.join(test_public_lists, "test-public-lists")

    logger.info("Building member metadata from typed pairs...")
    pair_to_type, member_gender, member_rels = _build_member_metadata(
        test_public_lists
    )

    relationships_csv = os.path.join(source_dir, "train_relationships.csv")
    train_rels_df = (
        pd.read_csv(relationships_csv)
        if os.path.exists(relationships_csv)
        else pd.DataFrame()
    )

    # Get families with relationship data
    families_with_rels = set()
    if len(train_rels_df) > 0:
        for col in ["p1", "p2"]:
            for val in train_rels_df[col]:
                families_with_rels.add(val.split("/")[0])

    train_faces_src = os.path.join(source_dir, "train-faces")
    all_train_families = (
        set(os.listdir(train_faces_src))
        if os.path.isdir(train_faces_src)
        else set()
    )

    # Split families with relationships 80/20 for train/val
    complete_families = sorted(families_with_rels & all_train_families)
    random.seed(42)  # Reproducible split
    val_count = len(complete_families) // 5
    val_families = set(random.sample(complete_families, val_count))

    # Families without relationships go to train only
    train_families = all_train_families - val_families

    # Organize train data
    if os.path.isdir(train_faces_src):
        train_data_dest = os.path.join(dataset_dir, "train", "data")
        etau.ensure_dir(train_data_dest)
        for family in train_families:
            src_family = os.path.join(train_faces_src, family)
            dest_family = os.path.join(train_data_dest, family)
            if os.path.isdir(src_family) and not os.path.exists(dest_family):
                shutil.copytree(src_family, dest_family)
                _generate_mid_csv(
                    dest_family, family, member_gender, member_rels
                )

    # Organize val data
    if os.path.isdir(train_faces_src):
        val_data_dest = os.path.join(dataset_dir, "val", "data")
        etau.ensure_dir(val_data_dest)
        for family in val_families:
            src_family = os.path.join(train_faces_src, family)
            dest_family = os.path.join(val_data_dest, family)
            if os.path.isdir(src_family) and not os.path.exists(dest_family):
                shutil.copytree(src_family, dest_family)
                _generate_mid_csv(
                    dest_family, family, member_gender, member_rels
                )

    # Generate train labels (excluding val families)
    if len(train_rels_df) > 0:
        train_pairs = [
            (row["p1"].rstrip("/"), row["p2"].rstrip("/"))
            for _, row in train_rels_df.iterrows()
            if row["p1"].split("/")[0] not in val_families
        ]
        labels_path = os.path.join(dataset_dir, "train", "labels.csv")
        _generate_labels_csv(train_pairs, labels_path, pair_to_type)

        # Generate val labels
        val_pairs = [
            (row["p1"].rstrip("/"), row["p2"].rstrip("/"))
            for _, row in train_rels_df.iterrows()
            if row["p1"].split("/")[0] in val_families
        ]
        labels_path = os.path.join(dataset_dir, "val", "labels.csv")
        _generate_labels_csv(val_pairs, labels_path, pair_to_type)

    test_faces_src = os.path.join(source_dir, "test-public-faces")
    if os.path.isdir(os.path.join(test_faces_src, "test-public-faces")):
        test_faces_src = os.path.join(test_faces_src, "test-public-faces")
    if os.path.isdir(test_faces_src):
        test_data_dest = os.path.join(dataset_dir, "test", "data")
        etau.ensure_dir(test_data_dest)
        for family in os.listdir(test_faces_src):
            src_family = os.path.join(test_faces_src, family)
            dest_family = os.path.join(test_data_dest, family)
            if os.path.isdir(src_family) and not os.path.exists(dest_family):
                shutil.copytree(src_family, dest_family)
                _generate_mid_csv(
                    dest_family, family, member_gender, member_rels
                )

        labels_path = os.path.join(dataset_dir, "test", "labels.csv")
        _generate_test_labels_csv(test_public_lists, labels_path)

    splits_path = os.path.join(dataset_dir, "splits.csv")
    _generate_splits_csv(dataset_dir, splits_path)


def _build_member_metadata(test_public_dir):
    """Build gender and relationship info from typed pairs."""
    member_gender_votes = defaultdict(Counter)
    member_rels = defaultdict(dict)
    pair_to_type = {}

    if not os.path.isdir(test_public_dir):
        return {}, {}, {}

    for f in os.listdir(test_public_dir):
        if not f.endswith(".csv"):
            continue
        rtype = f.replace(".csv", "")
        df = pd.read_csv(os.path.join(test_public_dir, f))

        g1, g2 = _TYPE_TO_GENDER.get(rtype, (None, None))
        r1, r2 = _TYPE_TO_REL.get(rtype, (None, None))

        for _, row in df.iterrows():
            p1 = row["p1"].rstrip("/")
            p2 = row["p2"].rstrip("/")

            key = (min(p1, p2), max(p1, p2))
            pair_to_type[key] = rtype

            if g1:
                member_gender_votes[p1][g1] += 1
            if g2:
                member_gender_votes[p2][g2] += 1
            if r1:
                member_rels[p1][p2] = r1
            if r2:
                member_rels[p2][p1] = r2

    member_gender = {}
    for m, votes in member_gender_votes.items():
        if votes:
            member_gender[m] = votes.most_common(1)[0][0]

    return pair_to_type, member_gender, dict(member_rels)


def _generate_mid_csv(family_dir, family_id, member_gender, member_rels):
    """Generate mid.csv with gender and relationship matrix."""
    mids = []
    for item in os.listdir(family_dir):
        item_path = os.path.join(family_dir, item)
        if os.path.isdir(item_path) and item.startswith("MID"):
            try:
                mid_num = int(item.replace("MID", ""))
                mids.append(mid_num)
            except ValueError:
                continue

    if not mids:
        return None

    mids.sort()

    rows = []
    for mid in mids:
        identifier = "%s/MID%d" % (family_id, mid)
        gender = member_gender.get(identifier, "U")
        row = {"MID": mid}
        rels = member_rels.get(identifier, {})
        for col_idx, other_mid in enumerate(mids):
            other_id = "%s/MID%d" % (family_id, other_mid)
            rel_code = rels.get(other_id, 0)
            row["MID%d" % col_idx] = rel_code
        row["Name"] = "Member_%d" % mid
        row["Gender"] = gender
        rows.append(row)

    df = pd.DataFrame(rows)
    csv_path = os.path.join(family_dir, "mid.csv")
    df.to_csv(csv_path, index=False)
    return csv_path


def _generate_labels_csv(pairs_source, output_path, pair_to_type):
    """Generate labels.csv with relationship types."""
    if isinstance(pairs_source, str):
        df = pd.read_csv(pairs_source)
        pairs = [
            (row["p1"].rstrip("/"), row["p2"].rstrip("/"))
            for _, row in df.iterrows()
        ]
    else:
        pairs = pairs_source

    rows = []
    for p1, p2 in pairs:
        key = (min(p1, p2), max(p1, p2))
        ptype = pair_to_type.get(key, "kin")
        rows.append({"p1": p1, "p2": p2, "ptype": ptype})

    df_out = pd.DataFrame(rows)
    etau.ensure_dir(os.path.dirname(output_path))
    df_out.to_csv(output_path, index=False)
    return output_path


def _generate_test_labels_csv(test_public_dir, output_path):
    """Generate test labels.csv from test-public-lists."""
    rows = []
    for f in os.listdir(test_public_dir):
        if not f.endswith(".csv"):
            continue
        rtype = f.replace(".csv", "")
        df = pd.read_csv(os.path.join(test_public_dir, f))
        for _, row in df.iterrows():
            p1 = row["p1"].rstrip("/")
            p2 = row["p2"].rstrip("/")
            rows.append({"p1": p1, "p2": p2, "ptype": rtype})

    df_out = pd.DataFrame(rows)
    etau.ensure_dir(os.path.dirname(output_path))
    df_out.to_csv(output_path, index=False)
    return len(rows)


def _generate_splits_csv(data_dir, output_path):
    """Generate splits.csv listing all family IDs."""
    families = set()
    for split in _SPLITS:
        split_dir = os.path.join(data_dir, split, "data")
        if os.path.isdir(split_dir):
            for item in os.listdir(split_dir):
                if item.startswith("F") and os.path.isdir(
                    os.path.join(split_dir, item)
                ):
                    families.add(item)
    df = pd.DataFrame({"FID": sorted(families)})
    df.to_csv(output_path, index=False)
    return output_path


def _is_missing_images(dataset_dir):
    for split in _SPLITS:
        if not os.path.isdir(os.path.join(dataset_dir, split, "data")):
            return True

    return False


def _is_missing_labels(dataset_dir):
    required_files = [os.path.join(dataset_dir, "splits.csv")]

    for split in _SPLITS:
        required_files.append(os.path.join(dataset_dir, split, "labels.csv"))

    for f in required_files:
        if not os.path.isfile(f):
            return True

    return False


def _get_dataset_info(dataset_dir, split):
    splits_file = os.path.join(dataset_dir, "splits.csv")
    splits_df = pd.read_csv(splits_file)
    split_img_glob = os.path.join(
        dataset_dir, split, "data", "*", "*", "*.jpg"
    )
    num_samples = len(etau.get_glob_matches(split_img_glob))
    return num_samples, sorted(splits_df["FID"].unique())


_SPLITS = ["train", "test", "val"]

_TYPE_TO_GENDER = {
    "fs": ("M", "M"),
    "fd": ("M", "F"),
    "ms": ("F", "M"),
    "md": ("F", "F"),
    "bb": ("M", "M"),
    "ss": ("F", "F"),
    "gfgs": ("M", "M"),
    "gfgd": ("M", "F"),
    "gmgs": ("F", "M"),
    "gmgd": ("F", "F"),
}

_TYPE_TO_REL = {
    "fs": (4, 1),
    "fd": (4, 1),
    "ms": (4, 1),
    "md": (4, 1),
    "bb": (2, 2),
    "ss": (2, 2),
    "sibs": (2, 2),
    "gfgs": (6, 3),
    "gfgd": (6, 3),
    "gmgs": (6, 3),
    "gmgd": (6, 3),
}

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
