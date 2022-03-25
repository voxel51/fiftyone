"""
Image patch utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import cv2

import eta.core.image as etai

import fiftyone.core.frame as fof
import fiftyone.core.labels as fol
import fiftyone.core.validation as fov
import fiftyone.utils.eta as foue


class ImagePatchesExtractor(object):
    """Class for iterating over the labeled/unlabeled image patches in a
    collection.

    By default, this class emits only the image patches, but you can set
    ``include_labels`` to True to emit ``(img_patch, label)`` tuples.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        patches_field: the name of the field defining the image patches in each
            sample to extract. Must be of type
            :class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`, or
            :class:`fiftyone.core.labels.Polylines`
        include_labels (False): whether to emit ``(img_patch, label)`` tuples
            rather than just image patches
        force_rgb (False): whether to force convert the images to RGB
        force_square (False): whether to minimally manipulate the patch
            bounding boxes into squares prior to extraction
        alpha (None): an optional expansion/contraction to apply to the patches
            before extracting them, in ``[-1, inf)``. If provided, the length
            and width of the box are expanded (or contracted, when
            ``alpha < 0``) by ``(100 * alpha)%``. For example, set
            ``alpha = 1.1`` to expand the boxes by 10%, and set ``alpha = 0.9``
            to contract the boxes by 10%
    """

    def __init__(
        self,
        samples,
        patches_field,
        include_labels=False,
        force_rgb=False,
        force_square=False,
        alpha=None,
    ):
        self.samples = samples
        self.patches_field = patches_field
        self.include_labels = include_labels
        self.force_rgb = force_rgb
        self.force_square = force_square
        self.alpha = alpha

    def __len__(self):
        _, label_path = self.samples._get_label_field_path(self.patches_field)
        return self.samples.count(label_path)

    def __iter__(self):
        for sample in self.samples.select_fields(self.patches_field):
            patches = parse_patches(
                sample, self.patches_field, handle_missing="skip"
            )

            if patches is not None:
                fov.validate_image_sample(sample)
                img = _load_image(sample.filepath, force_rgb=self.force_rgb)
                for detection in patches.detections:
                    patch = extract_patch(
                        img,
                        detection,
                        force_square=self.force_square,
                        alpha=self.alpha,
                    )
                    if self.include_labels:
                        yield patch, detection.label
                    else:
                        yield patch


def parse_patches(doc, patches_field, handle_missing="skip"):
    """Parses the patches from the given document.

    Args:
        patches_field: the name of the field defining the image patches. Must
            be of type :class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`, or
            :class:`fiftyone.core.labels.Polylines`
        handle_missing ("skip"): how to handle documents with no patches.
            Supported values are:

                -   "skip": skip the document and return ``None``
                -   "image": use the whole image as a single patch
                -   "error": raise an error

    Returns:
        a :class:`fiftyone.core.labels.Detections` instance, or ``None``
    """
    label = doc[patches_field]

    if isinstance(label, fol.Detections):
        patches = label
    elif isinstance(label, fol.Detection):
        patches = fol.Detections(detections=[label])
    elif isinstance(label, fol.Polyline):
        patches = fol.Detections(detections=[label.to_detection()])
    elif isinstance(label, fol.Polylines):
        patches = label.to_detections()
    elif label is None:
        patches = None
    else:
        raise ValueError(
            "Field '%s' with value type %s is not a valid patches field"
            % (patches_field, type(label))
        )

    if patches is None or not patches.detections:
        if handle_missing == "skip":
            patches = None
        elif handle_missing == "image":
            patches = fol.Detections(
                detections=[fol.Detection(bounding_box=[0, 0, 1, 1])]
            )
        else:
            dtype = "Frame" if isinstance(doc, fof.Frame) else "Sample"
            raise ValueError("%s '%s' has no patches" % (dtype, doc.id))

    return patches


def extract_patch(img, detection, force_square=False, alpha=None):
    """Extracts the patch from the image.

    Args:
        img: a numpy image array
        detection: a :class:`fiftyone.core.labels.Detection` defining the
            patch
        force_square (False): whether to minimally manipulate the patch
            bounding box into a square prior to extraction
        alpha (None): an optional expansion/contraction to apply to the patch
            before extracting it, in ``[-1, inf)``. If provided, the length and
            width of the box are expanded (or contracted, when ``alpha < 0``)
            by ``(100 * alpha)%``. For example, set ``alpha = 1.1`` to expand
            the box by 10%, and set ``alpha = 0.9`` to contract the box by 10%

    Returns:
        the image patch
    """
    dobj = foue.to_detected_object(detection, extra_attrs=False)

    bbox = dobj.bounding_box
    if alpha is not None:
        bbox = bbox.pad_relative(alpha)

    return bbox.extract_from(img, force_square=force_square)


def _load_image(image_path, force_rgb=False):
    # pylint: disable=no-member
    flag = cv2.IMREAD_COLOR if force_rgb else cv2.IMREAD_UNCHANGED
    return etai.read(image_path, flag=flag)
