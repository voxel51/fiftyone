#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from setuptools import setup, find_packages
from wheel.bdist_wheel import bdist_wheel


class BdistWheelCustom(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # make just the wheel require these packages, since they aren't needed
        # for a development installation
        self.distribution.install_requires += [
            "fiftyone-brain>=0.7,<0.8",
            "fiftyone-db>=0.3,<0.4",
        ]


VERSION = "0.14.0"


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


EXTRAS_REQUIREMENTS = {"desktop": ["fiftyone-desktop>=0.17,<0.18"]}


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
    packages=find_packages() + ["fiftyone.recipes", "fiftyone.tutorials"],
    package_dir={
        "fiftyone.recipes": "docs/source/recipes",
        "fiftyone.tutorials": "docs/source/tutorials",
    },
    include_package_data=True,
    install_requires=[
        # third-party packages
        "argcomplete",
        "boto3",
        "Deprecated",
        "eventlet",
        "future",
        "Jinja2",
        "kaleido",
        "matplotlib",
        "mongoengine==0.20.0",
        "motor>=2.3,<3",
        "numpy",
        "opencv-python-headless",
        "packaging",
        "pandas",
        "Pillow>=6.2",
        "plotly>=4.14,<5",
        "pprintpp",
        "psutil",
        "pymongo>=3.11,<4",
        "PyYAML",
        "retrying",
        "scikit-learn",
        "scikit-image",
        "setuptools",
        "tabulate",
        "tornado>=5.1.1,<7",
        "xmltodict",
        "universal-analytics-python3>=1.0.1,<2",
        # internal packages
        "voxel51-eta>=0.5.3,<0.6",
    ],
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
    entry_points={"console_scripts": ["fiftyone=fiftyone.core.cli:main"]},
    python_requires=">=3.6",
    cmdclass={"bdist_wheel": BdistWheelCustom},
)
