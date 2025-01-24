"""
Grouped dataset utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.dataset as fod
import fiftyone.core.groups as fog


def group_collections(coll_dict, group_key, group_field="group"):
    """Merges the given collections into a grouped dataset using the specified
    field as a group key.

    The returned dataset will contain all samples from the input collections
    with non-None values for the specified ``group_key``, with all samples
    with a given ``group_key`` value in the same group.

    Examples::

        import fiftyone as fo
        import fiftyone.utils.groups as foug

        dataset1 = fo.Dataset()
        dataset1.add_samples(
            [
                fo.Sample(filepath="image-left1.jpg", group_id=1),
                fo.Sample(filepath="image-left2.jpg", group_id=2),
                fo.Sample(filepath="image-left3.jpg", group_id=3),
                fo.Sample(filepath="skip-me1.jpg"),
            ]
        )

        dataset2 = fo.Dataset()
        dataset2.add_samples(
            [
                fo.Sample(filepath="image-right1.jpg", group_id=1),
                fo.Sample(filepath="image-right2.jpg", group_id=2),
                fo.Sample(filepath="image-right4.jpg", group_id=4),
                fo.Sample(filepath="skip-me2.jpg"),
            ]
        )

        dataset = foug.group_collections(
            {"left": dataset1, "right": dataset2}, "group_id"
        )

    Args:
        coll_dict: a dict mapping slice names to
            :class:`fiftyone.core.collections.SampleCollection` instances
        group_key: the field to use as a group membership key. The field may
            contain values of any hashable type (int, string, etc)
        group_field ("group"): a name to use for the group field of the
            returned dataset

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    dataset = fod.Dataset()
    dataset.add_group_field(group_field)

    group_keys = set()
    for sample_collection in coll_dict.values():
        _group_keys = sample_collection.exists(group_key).distinct(group_key)
        group_keys.update(_group_keys)

    groups = {_id: fog.Group() for _id in group_keys}
    for group_slice, sample_collection in coll_dict.items():
        _add_slice(
            dataset,
            groups,
            sample_collection,
            group_field,
            group_key,
            group_slice,
        )

    return dataset


def _add_slice(
    dataset, groups, sample_collection, group_field, group_key, group_slice
):
    tmp = sample_collection.exists(group_key).clone()

    try:
        tmp.set_values(
            group_field,
            [groups[k].element(group_slice) for k in tmp.values(group_key)],
        )
        dataset.add_collection(tmp)
    finally:
        tmp.delete()
