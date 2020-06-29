# Configure port forwarding to access the session on your remote machine
ssh -L 5151:127.0.0.1:5151 username@remote_machine_ip

# Or you can use the FiftyOne CLI to launch the app
fiftyone remote
