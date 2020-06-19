"""
A very basic reimplementation of the Unix `kill` command that works on Windows.

Usage:
    python kill.py PROCESS_ID
"""

import psutil, sys

psutil.Process(int(sys.argv[1])).kill()
