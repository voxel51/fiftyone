"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from flask import Flask

app = Flask(__name__)


@app.route("/")
def root():
    """
    Root API route

    Returns:
        String
    """
    return "I am FiftyOne"
