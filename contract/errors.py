class DomainError(Exception):
    def __init__(self, code, message, details=None, status=409):
        super().__init__(message)
        self.code, self.message, self.details, self.status = code, message, details or {}, status

    def as_dict(self):
        return {'code': self.code, 'message': self.message, 'details': self.details}
