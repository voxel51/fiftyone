#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from pkg_resources import DistributionNotFound, get_distribution
import re
from setuptools import setup, find_packages


VERSION = "0.19.1"


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
    "boto3",
    "cachetools",
    "dacite>=1.6.0,<1.8.0",
    "Deprecated",
    "eventlet",
    "future",
    "hypercorn>=0.13.2",
    "Jinja2>=3",
    "kaleido",
    "matplotlib",
    "mongoengine==0.24.2",
    "motor>=2.5",
    "ndjson",
    "numpy",
    "packaging",
    "pandas",
    "Pillow>=6.2",
    "plotly>=4.14",
    "pprintpp",
    "psutil",
    "pymongo>=3.12",
    "pytz",
    "PyYAML",
    "retrying",
    "scikit-learn",
    "scikit-image",
    "setuptools",
    "sseclient-py>=1.7.2,<2",
    "sse-starlette>=0.10.3,<1",
    "starlette==0.20.4",
    "strawberry-graphql==0.138.1",
    "tabulate",
    "xmltodict",
    "universal-analytics-python3>=1.0.1,<2",
    # internal packages
    "fiftyone-brain>=0.10,<0.11",
    "fiftyone-db>=0.4,<0.5",
    "voxel51-eta>=0.8.2,<0.9",
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
            get_distribution(name)
            chosen = main
            break
        except DistributionNotFound:
            pass

    return str(chosen)


def get_install_requirements(install_requires, choose_install_requires):
    for mains, secondary in choose_install_requires:
        install_requires.append(choose_requirement(mains, secondary))

    return install_requires


EXTRAS_REQUIREMENTS = {"desktop": ["fiftyone-desktop>=0.25,<0.26"]}


with open("README.md", "r") as fh:
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
    extras_require=EXTRAS_REQUIREMENTS,
    license="Apache",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(
        exclude=["app", "eta", "package", "requirements", "tests", "tools"]
    )
    + ["fiftyone.recipes", "fiftyone.tutorials"],
    package_dir={
        "fiftyone.recipes": "docs/source/recipes",
        "fiftyone.tutorials": "docs/source/tutorials",
    },
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
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
    ],
    entry_points={"console_scripts": ["fiftyone=fiftyone.core.cli:main"]},
    python_requires=">=3.7",
)
