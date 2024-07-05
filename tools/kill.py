"""
A very basic reimplementation of the Unix `kill` command that works on Windows.

Usage:
    python kill.py PROCESS_ID
"""

import sys

import psutil


psutil.Process(int(sys.argv[1])).kill()
