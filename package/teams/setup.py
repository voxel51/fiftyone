#!/usr/bin/env python
"""
Installs FiftyOne Teams App

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from pkg_resources import DistributionNotFound, get_distribution
import re
from setuptools import setup


VERSION = "0.1.2"


INSTALL_REQUIRES = [
    "python-jose>=3.3.0,<4",
    "fiftyone>=0.8.2",
]


CHOOSE_INSTALL_REQUIRES = []


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


with open("README.md", "r") as fh:
    long_description = fh.read()


setup(
    name="fiftyone-teams-app",
    version=get_version(),
    description=("FiftyOne Teams"),
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=["fiftyone.teams"],
    include_package_data=True,
    install_requires=get_install_requirements(
        INSTALL_REQUIRES, CHOOSE_INSTALL_REQUIRES
    ),
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
        "Programming Language :: Python :: 3.6",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
    ],
    python_requires=">=3.7",
)
