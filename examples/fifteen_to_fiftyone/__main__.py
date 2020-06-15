"""
Script to launch the 15to51 Jupyter notebook.
"""

import os
import sys

from jupyter_core.command import main

sys.argv[1:] = [
    "notebook",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "15to51.ipynb"),
]
main()
