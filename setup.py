#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from setuptools import setup, find_packages

VERSION = "1.19.0"


def get_version():
    if "RELEASE_VERSION" in os.environ:
        version = os.environ["RELEASE_VERSION"]
        if not version.startswith(VERSION):
            raise ValueError(
                "Release version does not match version: %s and %s"
                % (version, VERSION)
            )
        return version
    return VERSION


with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()


setup(
    name="fiftyone",
    version=get_version(),
    description=(
        "FiftyOne: the open-source tool for building high-quality datasets "
        "and computer vision models"
    ),
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="Apache",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(
        exclude=["app", "eta", "package", "requirements", "tests", "tools"]
    ),
    install_requires=[
        # python-packaged or meta libraries (unconstrained)
        "Deprecated",  # Don't constrain python-packaged `Deprecated`
        "packaging",  # Don't constrain python-packaged `packaging`
        "setuptools",  # Don't constrain python-packaged `setuptools`
        # third-party packages (constrained at lower and upper majors)
        "aiofiles>=20,<26",
        "argcomplete>=2,<4",
        "async_lru>=2,<3",
        "beautifulsoup4>=2,<5",  # BS4 will only have 4.x versions
        "boto3>=1,<2",
        "cachetools>=5,<8",
        "dacite>=1.6.0,<2",
        "dill>=0.1,<0.5",
        "exceptiongroup>=1,<2",
        "ftfy>=4,<7",
        "humanize>=2,<5",
        "hypercorn>=0.13.2,<0.19",
        "Jinja2>=3,<4",
        "jsonpatch>=1,<2",
        "mongoengine~=0.29.1",  # Keep small bounds on mongo-related libraries
        "motor~=3.6.0",  # Keep small bounds on mongo-related libraries
        "Pillow>=12.2",
        "plotly>=6.1.1,<7",
        "pprintpp>=0.1,<0.5",
        "psutil>=5,<8",
        "pydash>=6,<9",
        "pymongo~=4.9.2",  # Keep small bounds on mongo-related libraries
        "pytz",  # Doesn't follow semver, keep unconstrained
        "PyYAML>=4,<7",
        "regex",  # Doesn't follow semver, keep unconstrained
        "retrying>=1,<2",
        "sseclient-py>=1.7.2,<2",
        "sse-starlette>=0.10.3,<4",
        "starlette>=1.3.1,<1.4",
        "strawberry-graphql>=0.312.3,<0.317.0",
        "tabulate>=0.7,<0.11",
        "tqdm>=2,<5",
        "xmltodict>=1,<2",
        "universal-analytics-python3>=1.0.1,<2",
        # ML Libraries
        "matplotlib<4",
        "numpy<3",
        "opencv-python-headless<5",
        "pandas<4",
        "rtree<2",
        "scikit-learn<2",
        "scikit-image<1",
        "scipy<2",
        # internal packages
        "fiftyone-brain>=0.22.0,<0.23",
        "fiftyone-db>=0.4,<2.0",
        "voxel51-eta>=0.16.0,<0.17",
    ],
    include_package_data=True,
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: Apache Software License",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: Scientific/Engineering :: Image Processing",
        "Topic :: Scientific/Engineering :: Image Recognition",
        "Topic :: Scientific/Engineering :: Information Analysis",
        "Topic :: Scientific/Engineering :: Visualization",
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Operating System :: Microsoft :: Windows",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    entry_points={"console_scripts": ["fiftyone=fiftyone.core.cli:main"]},
    python_requires=">=3.10",
    extras_require={
        "multimodal-mcap": [
            "protobuf==6.33.6",
        ],
        "multimodal": ["fiftyone[multimodal-mcap]"],
    },
)
