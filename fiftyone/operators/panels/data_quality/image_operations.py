import numpy as np
from .utils import (
    get_filepath,
    _convert_opencv_to_pillow,
    _convert_pillow_to_opencv,
    _crop_pillow_image,
    _get_opencv_grayscale_image,
    _get_pillow_patch,
)
from PIL import Image
import cv2


def _compute_brightness(pillow_img):
    pixels = np.array(pillow_img)
    if pixels.ndim == 3 and pixels.shape[-1] == 3:
        r, g, b = pixels.mean(axis=(0, 1))
    else:
        mean = pixels.mean()
        r, g, b = (
            mean,
            mean,
            mean,
        )

    ## equation from here:
    ## https://www.nbdtech.com/Blog/archive/2008/04/27/calculating-the-perceived-brightness-of-a-color.aspx
    ## and here:
    ## https://github.com/cleanlab/cleanvision/blob/72a1535019fe7b4636d43a9ef4e8e0060b8d66ec/src/cleanvision/issue_managers/image_property.py#L95
    brightness = (
        np.sqrt(0.241 * r**2 + 0.691 * g**2 + 0.068 * b**2) / 255
    )
    return brightness


def _compute_exposure(opencv_gray_img):
    # pylint: disable=no-member
    histogram = cv2.calcHist([opencv_gray_img], [0], None, [256], [0, 256])
    normalized_histogram = histogram.ravel() / histogram.max()
    min_exposure = normalized_histogram[0]
    max_exposure = normalized_histogram[-1]
    return min_exposure, max_exposure


def _compute_entropy(pillow_img):
    return pillow_img.entropy()


def _compute_aspect_ratio(width, height):
    ratio = width / height
    return min(ratio, 1 / ratio)


def _compute_blurriness(cv2_img):
    # pylint: disable=no-member
    gray = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2GRAY)
    # pylint: disable=no-member
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()
    return variance


def compute_sample_brightness(sample):
    filepath = get_filepath(sample)
    with Image.open(filepath) as image:
        return _compute_brightness(image)


def compute_patch_brightness(sample, detection):
    patch = _get_pillow_patch(sample, detection)
    return _compute_brightness(patch)


def compute_sample_exposure(sample):
    gray_img = _get_opencv_grayscale_image(sample)
    return _compute_exposure(gray_img)


def compute_patch_exposure(sample, detection):
    gray_img = _get_opencv_grayscale_image(sample)
    pillow_image = _convert_opencv_to_pillow(gray_img)
    patch = _crop_pillow_image(pillow_image, detection)
    patch = _convert_pillow_to_opencv(patch)
    return _compute_exposure(patch)


def compute_sample_entropy(sample):
    filepath = get_filepath(sample)
    with Image.open(filepath) as image:
        return _compute_entropy(image)


def compute_patch_entropy(sample, detection):
    patch = _get_pillow_patch(sample, detection)
    return _compute_entropy(patch)


def compute_sample_aspect_ratio(sample):
    if sample.metadata is None:
        sample.compute_metadata()
    width, height = sample.metadata.width, sample.metadata.height
    return _compute_aspect_ratio(width, height)


def compute_patch_aspect_ratio(sample, detection):
    if sample.metadata is None:
        sample.compute_metadata()
    img_width, img_height = sample.metadata.width, sample.metadata.height
    bbox_width, bbox_height = detection.bounding_box[2:]
    width, height = bbox_width * img_width, bbox_height * img_height
    return _compute_aspect_ratio(width, height)


def compute_sample_blurriness(sample):
    # pylint: disable=no-member
    image = cv2.imread(get_filepath(sample))
    return _compute_blurriness(image)


def compute_patch_blurriness(sample, detection):
    patch = _get_pillow_patch(sample, detection)
    patch = _convert_pillow_to_opencv(patch)
    return _compute_blurriness(patch)
