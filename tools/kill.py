import psutil, sys

psutil.Process(int(sys.argv[1])).kill()
