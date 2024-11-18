#!/usr/bin/env python
"""
Installs FiftyOne Teams.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import re
from importlib import metadata

from setuptools import find_packages, setup

VERSION = "2.2.0"


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


INSTALL_REQUIRES = [
    # third-party packages
    "aiofiles",
    "argcomplete",
    "beautifulsoup4",
    "boto3",
    "cachetools",
    "dacite>=1.6.0,<1.8.0",
    "dill",
    "Deprecated",
    "ftfy",
    "jsonlines",
    "humanize",
    "hypercorn>=0.13.2",
    "Jinja2>=3",
    # kaleido indirectly required by plotly for image export
    # https://plotly.com/python/static-image-export/
    "kaleido!=0.2.1.post1",
    "matplotlib",
    "mongoengine==0.24.2",
    "motor>=2.5",
    "numpy",
    "packaging",
    "pandas",
    "Pillow>=6.2",
    "plotly>=4.14",
    "pprintpp",
    "psutil",
    "pymongo>=3.12,<4.9",
    "pytz",
    "PyYAML",
    "regex",
    "retrying",
    "rtree",
    "scikit-learn",
    "scikit-image",
    "scipy",
    "setuptools",
    "sseclient-py>=1.7.2,<2",
    "sse-starlette>=0.10.3,<1",
    "starlette>=0.24.0",
    "strawberry-graphql",
    "tabulate",
    "xmltodict",
    "universal-analytics-python3>=1.0.1,<2",
    "pydash",
    # teams specific
    "aiohttp",
    "azure-identity",
    "azure-storage-blob>=12.4.0",
    "backoff",
    "boto3>=1.15",
    "google-api-python-client",
    "google-cloud-storage>=1.36",
    "pysftp",
    "schedule",
    "websocket-client>=1.5.0",
    "yarl",
    "wcmatch",
    # internal packages
    "fiftyone-brain>=0.17.0,<0.18",
    "fiftyone-db~=0.4",  # pinned to legacy db, do not remove
    "voxel51-eta>=0.13.0,<0.14",
]


CHOOSE_INSTALL_REQUIRES = [
    (
        (
            "opencv-python",
            "opencv-contrib-python",
            "opencv-contrib-python-headless",
        ),
        "opencv-python-headless",
    )
]


def choose_requirement(mains, secondary):
    chosen = secondary
    for main in mains:
        try:
            name = re.split(r"[!<>=]", main)[0]
            metadata.version(name)
            chosen = main
            break
        except metadata.PackageNotFoundError:
            pass

    return str(chosen)


def get_install_requirements(install_requires, choose_install_requires):
    for mains, secondary in choose_install_requires:
        install_requires.append(choose_requirement(mains, secondary))

    return install_requires


with open("README.md", "r") as fh:
    long_description = fh.read()


setup(
    name="fiftyone",
    version="2.2.0rc11",
    description=(
        "FiftyOne Teams: the tool for teams building high-quality datasets "
        "and computer vision models"
    ),
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(
        exclude=["app", "eta", "package", "requirements", "tests", "tools"]
    ),
    install_requires=get_install_requirements(
        INSTALL_REQUIRES, CHOOSE_INSTALL_REQUIRES
    ),
    include_package_data=True,
    classifiers=[
        "Development Status :: 4 - Beta",
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
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    entry_points={"console_scripts": ["fiftyone=fiftyone.core.cli:main"]},
    python_requires=">=3.9",
)
