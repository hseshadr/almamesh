"""The public type surface for ``shared_libs_python.errors``.

A canonical error is ``{code, params, category}`` and serializes to the RFC 9457
Problem Details shape on the wire. The :class:`CatalogEntry` for a code is the
typed contract for that error's params. Mirrors ``@edgeproc/errors`` (TS).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum

#: A stable, namespaced error identity, e.g. ``ai.provider.out_of_credits``.
type ErrorCode = str

#: A value that may be interpolated into an error description.
type ParamValue = str | int | float

#: A read-only bag of interpolation values, keyed by param name.
type Params = Mapping[str, ParamValue]

#: A predicate that inspects a raw failure and claims it for a code.
type MatchRule = Callable[[object], bool]

#: A consumer-provided i18next/Babel-style translator: ``t("errors.<code>", params)``.
#: By contract it returns the key verbatim when the resource is missing, which is
#: our signal to fall back to the catalog default English.
type TFunction = Callable[[str, Params], str]


class Category(StrEnum):
    """How a failure is treated by UI + telemetry (retry vs. "open Settings" …)."""

    PROVIDER = "provider"
    CONFIG = "config"
    NETWORK = "network"
    TIMEOUT = "timeout"
    DEVICE = "device"
    INTEGRITY = "integrity"
    INTERNAL = "internal"


@dataclass(frozen=True, slots=True)
class CatalogEntry:
    """One code's typed contract: its category, allowed params, and match rule."""

    category: Category
    params: tuple[str, ...] = ()
    i18n_key: str | None = None
    http_status: tuple[int, ...] = ()
    problem_type: str | None = None
    en: str | None = None
    match: MatchRule | None = None


#: A map of code -> entry. Each site declares and owns its own.
type Catalog = Mapping[str, CatalogEntry]


@dataclass(frozen=True, slots=True)
class ProblemDetails:
    """RFC 9457 Problem Details. Params ride along as extension ``members``."""

    type: str
    title: str
    status: int | None = None
    instance: str | None = None
    detail: str | None = None
    members: Mapping[str, ParamValue] = field(default_factory=dict)

    def to_dict(self) -> dict[str, ParamValue]:
        """Flatten to the RFC 9457 wire object: members spread, core fields win."""
        wire: dict[str, ParamValue] = dict(self.members)
        wire["type"] = self.type
        wire["title"] = self.title
        if self.status is not None:
            wire["status"] = self.status
        if self.instance is not None:
            wire["instance"] = self.instance
        if self.detail is not None:
            wire["detail"] = self.detail
        return wire
