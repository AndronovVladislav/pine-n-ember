class NotFound(Exception):
    """Запрошенная сущность не найдена."""


class InvalidOperation(Exception):
    """Операция недопустима в текущем состоянии."""


class ExternalServiceUnavailable(Exception):
    """Внешний сервис (например, источник курса валют) недоступен или вернул ошибку."""
