"""
Utilities for working with the
`Families in the Wild dataset <https://web.northeastern.edu/smilelab/fiw/>`_.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import random
import shutil
from collections import defaultdict

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
        samples = _load_split(data_path, tags, labels_path, progress=progress)
        dataset.add_samples(samples, progress=progress)

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


def _load_split(split_dir, tags, labels_path, progress=None):
    samples = []
    face_indices = defaultdict(lambda: 0)
    kinship_map = _parse_kinship_map(labels_path)

    subdirs = etau.list_subdirs(split_dir)
    with fou.ProgressBar(subdirs, progress=progress) as pb:
        for family in pb(subdirs):
            family_dir = os.path.join(split_dir, family)
            mid_csv_path = os.path.join(split_dir, family, "mid.csv")
            if not os.path.isfile(mid_csv_path):
                continue

            labels = pd.read_csv(mid_csv_path)
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

    if not os.path.isdir(dir_images):
        return samples

    imgs_list = os.listdir(dir_images)
    rels = _get_relationships(labels, member_id_int, num_members, family_id)

    for img in imgs_list:
        if not img.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue

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
    parts = filename.split("_")
    if len(parts) >= 2:
        return parts[0], parts[1]
    return filename, "face0"


def _get_mid(member_id):
    return int(member_id.replace("MID", ""))


def _format_mid(member_id_int):
    return "MID" + str(member_id_int)


def _get_name(labels, member_id):
    if "Name" not in labels.columns:
        return None

    names = labels["Name"]
    row = labels.loc[labels["MID"] == member_id]
    if len(row) > 0:
        return row["Name"].values[0]

    return None


def _get_gender(labels, member_id):
    if "Gender" not in labels.columns:
        return None

    row = labels.loc[labels["MID"] == member_id]
    if len(row) > 0:
        return row["Gender"].values[0]

    return None


def _parse_kinship_map(labels_path):
    if not os.path.isfile(labels_path):
        return {}

    split_list = pd.read_csv(labels_path)
    kinship_map = defaultdict(lambda: defaultdict(set))

    if "p1" not in split_list.columns or "p2" not in split_list.columns:
        return {}

    ptype_col = "ptype" if "ptype" in split_list.columns else None

    for _, row in split_list.iterrows():
        p1 = _parse_identifier(row["p1"])
        p2 = _parse_identifier(row["p2"])
        ptype = row[ptype_col] if ptype_col else "kin"
        kinship_map[p1][ptype].add(p2)
        kinship_map[p2][ptype].add(p1)

    return dict(kinship_map)


def _parse_identifier(identifier):
    identifier = str(identifier).rstrip("/")
    id_parts = identifier.split("/")
    if len(id_parts) not in [2, 3]:
        raise ValueError("Invalid identifier found: '%s'" % identifier)

    return "/".join(id_parts[:2])


def parse_fiw_dataset(source_dir, dataset_dir, split):
    """Parses the manually downloaded FIW dataset.

    This function accepts the official FIW download structure with a ``FIDs/``
    directory containing all families, and organizes it into the FiftyOne
    expected format with train/val/test splits.

    Args:
        source_dir: the directory containing the manually downloaded FIW files.
            Should contain either a ``FIDs/`` directory (official structure) or
            individual family directories (F0001, F0002, etc.)
        dataset_dir: the directory to output the final dataset
        split: the split to prepare ("train", "val", or "test")

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
    """Validates the source directory contains FIW data."""
    if source_dir is None:
        _raise_fiw_error(
            "You must provide a `source_dir` in order to load the FIW dataset."
        )

    if not os.path.isdir(source_dir):
        _raise_fiw_error(
            "Source directory '%s' does not exist." % source_dir
        )

    contents = os.listdir(source_dir)

    fids_dir = os.path.join(source_dir, "FIDs")
    has_fids = os.path.isdir(fids_dir)

    family_dirs = [d for d in contents if d.startswith("F") and d[1:].isdigit()]
    has_family_dirs = len(family_dirs) > 0

    if not has_fids and not has_family_dirs:
        _raise_fiw_error(
            "Source directory '%s' does not contain FIW data.\n"
            "Expected either a 'FIDs/' directory or family directories "
            "(F0001, F0002, etc.)" % source_dir
        )


def _raise_fiw_error(msg):
    """Raises an error with instructions for obtaining FIW data."""
    raise OSError(
        "\n\n"
        + msg
        + "\n\n"
        + "The FIW dataset requires manual download from the official source.\n\n"
        + "1. Register at: https://docs.google.com/forms/d/e/1FAIpQLSd5_hbg-7QlrqE9V4MJShgww308yCxHlj6VOLctETX6aYLQgg/viewform\n"
        + "2. Download and extract the dataset\n"
        + "3. Pass the extraction directory as `source_dir`\n\n"
        + "Expected structure (official format):\n"
        + "   source_dir/\n"
        + "       FIDs/\n"
        + "           F0001/\n"
        + "               MID1/\n"
        + "                   *.jpg\n"
        + "               mid.csv\n"
        + "           F0002/\n"
        + "               ...\n"
        + "       FIW_PIDs.csv (optional)\n"
        + "       FIW_FIDs.csv (optional)\n"
        + "       FIW_RIDs.csv (optional)\n\n"
        + "More info: https://fulab.sites.northeastern.edu/fiw-download/\n"
        + "Run `fiftyone zoo datasets info fiw` for more information."
    )


def _organize_fiw_data(source_dir, dataset_dir):
    """Organizes FIW source data into FiftyOne expected structure."""
    if not _is_missing_images(dataset_dir) and not _is_missing_labels(dataset_dir):
        logger.info("Dataset already organized, skipping...")
        return

    logger.info("Organizing FIW data...")

    fids_dir = os.path.join(source_dir, "FIDs")

    if os.path.isdir(fids_dir):
        _organize_fids_structure(fids_dir, dataset_dir)
    else:
        _organize_fids_structure(source_dir, dataset_dir)


def _organize_fids_structure(families_dir, dataset_dir):
    """Organizes official FIW FIDs structure."""
    logger.info("Detected official FIDs structure")

    all_families = sorted([
        d for d in os.listdir(families_dir)
        if os.path.isdir(os.path.join(families_dir, d))
        and d.startswith("F")
        and (d[1:5].isdigit() if len(d) > 4 else d[1:].isdigit())
    ])

    if not all_families:
        _raise_fiw_error(
            "No family directories found in '%s'." % families_dir
        )

    logger.info("Found %d families", len(all_families))

    families_with_relationships = []
    for family in all_families:
        family_dir = os.path.join(families_dir, family)
        mid_csv = _find_mid_csv(family_dir, family)
        if mid_csv and _has_relationships(mid_csv):
            families_with_relationships.append(family)

    logger.info(
        "Found %d families with relationship data",
        len(families_with_relationships)
    )

    random.seed(42)

    if len(families_with_relationships) >= 10:
        n_val = max(1, len(families_with_relationships) // 10)
        n_test = max(1, len(families_with_relationships) // 10)

        shuffled = families_with_relationships.copy()
        random.shuffle(shuffled)

        val_families = set(shuffled[:n_val])
        test_families = set(shuffled[n_val:n_val + n_test])
        train_families = set(all_families) - val_families - test_families
    else:
        train_families = set(all_families)
        val_families = set()
        test_families = set()

    split_assignments = {
        "train": train_families,
        "val": val_families,
        "test": test_families,
    }

    logger.info(
        "Split sizes - train: %d, val: %d, test: %d",
        len(train_families), len(val_families), len(test_families)
    )

    all_pairs = defaultdict(list)

    for split_name, families in split_assignments.items():
        if not families:
            continue

        split_data_dir = os.path.join(dataset_dir, split_name, "data")
        etau.ensure_dir(split_data_dir)

        for family in families:
            src_family = os.path.join(families_dir, family)
            dest_family = os.path.join(split_data_dir, family)

            if os.path.exists(dest_family):
                continue

            _copy_family(src_family, dest_family, family)

            pairs = _extract_pairs_from_family(dest_family, family)
            all_pairs[split_name].extend(pairs)

    _generate_splits_csv(dataset_dir, all_families)

    for split_name in _SPLITS:
        labels_path = os.path.join(dataset_dir, split_name, "labels.csv")
        if not os.path.exists(labels_path) or os.path.getsize(labels_path) == 0:
            _generate_labels_csv(labels_path, all_pairs.get(split_name, []))


def _find_mid_csv(family_dir, family_id):
    """Finds the mid.csv file for a family, checking multiple naming conventions."""
    candidates = [
        os.path.join(family_dir, "mid.csv"),
        os.path.join(family_dir, "%s.csv" % family_id),
        os.path.join(family_dir, "F%s.csv" % family_id[1:] if family_id.startswith("F") else family_id),
    ]

    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate

    csv_files = [f for f in os.listdir(family_dir) if f.endswith(".csv")]
    if len(csv_files) == 1:
        return os.path.join(family_dir, csv_files[0])

    return None


def _has_relationships(mid_csv_path):
    """Checks if a mid.csv file contains relationship data."""
    try:
        df = pd.read_csv(mid_csv_path)
        if "MID" not in df.columns:
            return False

        numeric_cols = [c for c in df.columns if str(c).isdigit() or c.startswith("MID")]
        numeric_cols = [c for c in numeric_cols if c != "MID"]

        if not numeric_cols:
            return False

        for col in numeric_cols:
            if df[col].dtype in ['int64', 'float64']:
                if (df[col] > 0).any():
                    return True

        return False
    except Exception:
        return False


def _copy_family(src_family, dest_family, family_id):
    """Copies a family directory, ensuring mid.csv exists."""
    etau.ensure_dir(dest_family)

    mid_csv_src = _find_mid_csv(src_family, family_id)

    for item in os.listdir(src_family):
        src_item = os.path.join(src_family, item)
        dest_item = os.path.join(dest_family, item)

        if os.path.isdir(src_item) and item.startswith("MID"):
            if not os.path.exists(dest_item):
                shutil.copytree(src_item, dest_item)
        elif item.endswith(".csv"):
            if not os.path.exists(dest_item):
                shutil.copy2(src_item, dest_item)

    dest_mid_csv = os.path.join(dest_family, "mid.csv")
    if not os.path.exists(dest_mid_csv):
        if mid_csv_src:
            shutil.copy2(mid_csv_src, dest_mid_csv)
        else:
            _generate_mid_csv(dest_family, family_id)


def _generate_mid_csv(family_dir, family_id):
    """Generates a minimal mid.csv if none exists."""
    mids = []
    for item in os.listdir(family_dir):
        if os.path.isdir(os.path.join(family_dir, item)) and item.startswith("MID"):
            try:
                mid_num = int(item.replace("MID", ""))
                mids.append(mid_num)
            except ValueError:
                continue

    if not mids:
        return

    mids.sort()

    rows = []
    for mid in mids:
        row = {"MID": mid}
        for other_mid in mids:
            row[str(other_mid)] = 0
        row["Name"] = "Member_%d" % mid
        row["Gender"] = "U"
        rows.append(row)

    df = pd.DataFrame(rows)
    csv_path = os.path.join(family_dir, "mid.csv")
    df.to_csv(csv_path, index=False)


def _extract_pairs_from_family(family_dir, family_id):
    """Extracts kinship pairs from a family's mid.csv."""
    pairs = []

    mid_csv = os.path.join(family_dir, "mid.csv")
    if not os.path.isfile(mid_csv):
        return pairs

    try:
        df = pd.read_csv(mid_csv)
    except Exception:
        return pairs

    if "MID" not in df.columns:
        return pairs

    for _, row in df.iterrows():
        mid1 = row["MID"]
        p1 = "%s/MID%d" % (family_id, mid1)

        for col in df.columns:
            if col in ["MID", "Name", "Gender"]:
                continue

            try:
                rel_code = int(row[col])
            except (ValueError, TypeError):
                continue

            if rel_code <= 0 or rel_code not in _RELATIONSHIP_MAP:
                continue

            try:
                mid2 = int(col) if str(col).isdigit() else int(str(col).replace("MID", ""))
            except ValueError:
                continue

            if mid1 == mid2:
                continue

            p2 = "%s/MID%d" % (family_id, mid2)
            ptype = _RELATIONSHIP_MAP[rel_code]
            pairs.append((p1, p2, ptype))

    return pairs


def _generate_splits_csv(dataset_dir, all_families):
    """Generates splits.csv listing all family IDs."""
    splits_path = os.path.join(dataset_dir, "splits.csv")
    if os.path.exists(splits_path):
        return

    df = pd.DataFrame({"FID": sorted(all_families)})
    df.to_csv(splits_path, index=False)


def _generate_labels_csv(labels_path, pairs):
    """Generates labels.csv from extracted pairs."""
    etau.ensure_dir(os.path.dirname(labels_path))

    if not pairs:
        df = pd.DataFrame(columns=["p1", "p2", "ptype"])
    else:
        unique_pairs = list(set(pairs))
        df = pd.DataFrame(unique_pairs, columns=["p1", "p2", "ptype"])

    df.to_csv(labels_path, index=False)


def _is_missing_images(dataset_dir):
    """Checks if any split is missing image data."""
    for split in _SPLITS:
        split_data = os.path.join(dataset_dir, split, "data")
        if os.path.isdir(split_data):
            families = [d for d in os.listdir(split_data)
                       if os.path.isdir(os.path.join(split_data, d))]
            if families:
                return False

    return True


def _is_missing_labels(dataset_dir):
    """Checks if required label files are missing."""
    splits_file = os.path.join(dataset_dir, "splits.csv")
    if not os.path.isfile(splits_file):
        return True

    for split in _SPLITS:
        labels_file = os.path.join(dataset_dir, split, "labels.csv")
        if not os.path.isfile(labels_file):
            return True

    return False


def _get_dataset_info(dataset_dir, split):
    """Gets dataset info for a split."""
    splits_file = os.path.join(dataset_dir, "splits.csv")

    if os.path.isfile(splits_file):
        splits_df = pd.read_csv(splits_file)
        classes = sorted(splits_df["FID"].unique())
    else:
        classes = []

    split_img_glob = os.path.join(
        dataset_dir, split, "data", "*", "*", "*.jpg"
    )
    jpg_matches = etau.get_glob_matches(split_img_glob)

    split_img_glob_png = os.path.join(
        dataset_dir, split, "data", "*", "*", "*.png"
    )
    png_matches = etau.get_glob_matches(split_img_glob_png)

    num_samples = len(jpg_matches) + len(png_matches)

    return num_samples, classes


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
