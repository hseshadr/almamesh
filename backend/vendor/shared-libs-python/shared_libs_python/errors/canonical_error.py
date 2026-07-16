"""The exception types carried across throw-sites and catalog construction."""

from __future__ import annotations

from shared_libs_python.errors.types import Category, ErrorCode, Params


class CanonicalError(Exception):
    """An ``Exception`` carrying a canonical ``{code, category, params}``.

    Use it at throw-sites that already know the cause (an OPFS store on a quota
    error, a device-capability guard). The ``message`` is the code itself, so it
    stays greppable and stable in logs. For the ergonomic, category-aware path,
    prefer ``registry.create(code, params)``.
    """

    def __init__(self, code: ErrorCode, category: Category, params: Params | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.category = category
        self.params: Params = params if params is not None else {}


class DuplicateCodeError(Exception):
    """Raised by ``define_errors`` when a code appears in two catalog fragments.

    Codes are stable identities; a silent override would let two meanings share
    one code.
    """

    def __init__(self, code: str) -> None:
        super().__init__(
            f'Duplicate error code: "{code}" is defined in more than one catalog fragment.'
        )
        self.code = code
