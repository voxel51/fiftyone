"""
Label utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.labels as fol
import fiftyone.core.validation as fov


def objects_to_segmentations(
    sample_collection,
    in_field,
    out_field,
    mask_size=None,
    mask_targets=None,
    thickness=1,
):
    """Converts the instance segmentations or polylines in the specified field
    of the collection into semantic segmentation masks.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the objects field for which to render
            segmentation masks. Supported types are
            :class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`, and
            :class:`fiftyone.core.labels.Polylines`
        out_field: the name of the :class:`fiftyone.core.labels.Segmentation`
            field to populate
        frame_size (None): the ``(width, height)`` at which to render the
            segmentation masks. If not provided, masks will be rendered to
            match the resolution of each input image
        mask_targets (None): a dict mapping integer pixel values in
            ``[0, 255]`` to label strings defining which object classes to
            render and which pixel values to use for each class. If omitted,
            all objects are rendered with pixel value 255
        thickness (1): the thickness, in pixels, at which to render
            (non-filled) polylines
    """
    fov.validate_image_collection(sample_collection)
    fov.validate_collection_label_fields(
        sample_collection,
        in_field,
        (fol.Detection, fol.Detections, fol.Polyline, fol.Polylines),
    )

    for sample in sample_collection.iter_samples(progress=True):
        if mask_size is not None:
            frame_size = mask_size
        else:
            if sample.metadata is None:
                sample.compute_metadata()

            frame_size = (sample.metadata.width, sample.metadata.height)

        label = sample[in_field]
        if label is None:
            continue

        segmentation = None

        if isinstance(label, fol.Polyline):
            label = fol.Polylines(polylines=[label])

        if isinstance(label, fol.Detection):
            label = fol.Detections(detections=[label])

        if isinstance(label, fol.Polylines):
            segmentation = label.to_segmentation(
                frame_size=frame_size,
                mask_targets=mask_targets,
                thickness=thickness,
            )

        if isinstance(label, fol.Detections):
            segmentation = label.to_segmentation(
                frame_size=frame_size, mask_targets=mask_targets,
            )

        if segmentation is not None:
            sample[out_field] = segmentation
            sample.save()

    if mask_targets is not None:
        if not sample_collection.default_mask_targets:
            sample_collection.default_mask_targets = mask_targets
        else:
            sample_collection.mask_targets[out_field] = mask_targets


def classification_to_detections(sample_collection, in_field, out_field):
    """Converts the :class:`fiftyone.core.labels.Classification` field of the
    collection into a :class:`fiftyone.core.labels.Detections` field containing
    a single detection whose bounding box spans the entire image.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        in_field: the name of the :class:`fiftyone.core.labels.Classification`
            field
        out_field: the name of the :class:`fiftyone.core.labels.Detections`
            field to populate
    """
    fov.validate_image_collection(sample_collection)
    fov.validate_collection_label_fields(
        sample_collection, in_field, fol.Classification
    )

    samples = sample_collection.select_fields(in_field)
    for sample in samples.iter_samples(progress=True):
        classification = sample[in_field]
        if classification is None:
            continue

        detection = fol.Detection(
            label=classification.label,
            bounding_box=[0, 0, 1, 1],  # entire image
            confidence=classification.confidence,
        )
        sample[out_field] = fol.Detections(detections=[detection])
        sample.save()
