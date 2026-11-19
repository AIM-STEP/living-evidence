"""Public model errors shared by the local service and authenticated gateway."""

ERRORS = {
    'MODEL_REQUEST_INVALID': (400, 'The service could not read the structured model request.'),
    'MODEL_SCHEMA_ERROR': (422, 'The model returned a result with an invalid structure or question identifier.'),
    'MODEL_REVIEW_INCOMPLETE': (422, 'The model did not complete the required semantic assessments.'),
    'MODEL_BUSY': (429, 'The model service is busy. Try again shortly.'),
    'MODEL_UPSTREAM_ERROR': (502, 'The model service could not complete this request.'),
    'MODEL_UNAVAILABLE': (503, 'The model service is temporarily unavailable.'),
    'MODEL_TIMEOUT': (504, 'The model service did not respond in time.'),
}


def public_error(code):
    status, message = ERRORS[code]
    return status, {'error': message, 'code': code}
