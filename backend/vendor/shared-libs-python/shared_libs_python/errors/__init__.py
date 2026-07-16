"""Canonical errors — register a catalog, classify raw failures, describe + serialize.

The Python mirror of the ``@edgeproc/errors`` TS package. Register a per-app
catalog of codes, classify raw transport/LLM failures into those codes, describe
them via your own i18n (falling back to catalog English), and serialize to the
RFC 9457 Problem Details shape. The optional :data:`starter_pack` supplies 18
universal codes so a site need not re-declare the common ones.

Quickstart::

    from shared_libs_python.errors import define_errors, starter_pack

    registry = define_errors(starter_pack)
    registry.classify({"status": 402})            # 'ai.provider.out_of_credits'
    registry.describe("ai.provider.out_of_credits")  # default English
    registry.to_problem_details("ai.provider.out_of_credits").to_dict()
"""

from __future__ import annotations

from shared_libs_python.errors.canonical_error import CanonicalError, DuplicateCodeError
from shared_libs_python.errors.raw import error_name_of, error_text_of, http_status_of
from shared_libs_python.errors.registry import Registry, define_errors
from shared_libs_python.errors.starter_pack import starter_pack
from shared_libs_python.errors.types import (
    Catalog,
    CatalogEntry,
    Category,
    ErrorCode,
    MatchRule,
    Params,
    ParamValue,
    ProblemDetails,
    TFunction,
)

__all__ = [
    "CanonicalError",
    "Catalog",
    "CatalogEntry",
    "Category",
    "DuplicateCodeError",
    "ErrorCode",
    "MatchRule",
    "ParamValue",
    "Params",
    "ProblemDetails",
    "Registry",
    "TFunction",
    "define_errors",
    "error_name_of",
    "error_text_of",
    "http_status_of",
    "starter_pack",
]
