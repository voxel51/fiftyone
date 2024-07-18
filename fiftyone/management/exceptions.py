class FiftyOneManagementError(Exception):
    """Exception raised for errors in the SDK.

    Attributes:
        message -- explanation of the error
    """

    def __init__(self, message):
        self.message = message
        super().__init__(self.message)
