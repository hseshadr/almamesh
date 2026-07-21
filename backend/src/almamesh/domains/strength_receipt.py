"""Sign a domain's calibrated strength % into an offline-verifiable Avow receipt.

WHY: the no-fake-precision covenant says every headline ``strength_pct`` is a
calibrated, anchored, Tier-"model" number whose derivation stays visible. This module
makes the covenant *provable*: the domain and its full ``StrengthSummary`` (both axes,
tier, note — nothing cherry-picked) are frozen into a subject and Ed25519-signed via
the shared ``avow`` trust envelope. Any holder verifies the receipt offline against a
pinned public key — no network, no chart inputs, no scientific stack.

Lego seam: AlmaMesh depends on the ENVELOPE ONLY (``avow``, not ``avow[assay]``), and
this module is the anti-corruption boundary — callers import sign/verify from here,
never from ``avow`` directly, so the engine can evolve behind one seam. The subject
carries no timestamps, so identical strength facts sign to identical receipts
(deterministic Ed25519), preserving the CPython<->Pyodide byte-parity discipline.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from avow import SignedReceipt, sign_payload, verify_receipt
from pydantic import BaseModel, ConfigDict

from almamesh.schemas.domains import LifeDomain, LifeDomainsContext, StrengthSummary

if TYPE_CHECKING:
    from nacl.signing import SigningKey


class DomainStrengthSubject(BaseModel):
    """The signed claim: THIS domain scored THIS calibrated summary.

    The full ``StrengthSummary`` is embedded (axes, band, tier, covenant note) so the
    receipt can never assert a headline % detached from its derivation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    domain: LifeDomain
    summary: StrengthSummary


def sign_domain_strength(
    domain: LifeDomain, summary: StrengthSummary, *, signing_key: SigningKey
) -> SignedReceipt[DomainStrengthSubject]:
    """Freeze the domain + summary into a subject and Ed25519-sign it."""
    subject = DomainStrengthSubject(domain=domain, summary=summary)
    return sign_payload(subject, signing_key)


def seal_domain_strengths(
    domains: LifeDomainsContext, *, signing_key: SigningKey
) -> dict[LifeDomain, SignedReceipt[DomainStrengthSubject]]:
    """Seal EVERY computed domain summary — no domain may ship unsealed.

    Sealing is total by construction (one receipt per ``forecasts`` entry) so a
    caller can never quietly narrow which strength claims are provable."""
    return {
        domain: sign_domain_strength(domain, forecast.strength_summary, signing_key=signing_key)
        for domain, forecast in domains.forecasts.items()
    }


def verify_domain_strength(
    receipt: SignedReceipt[DomainStrengthSubject], *, expected_public_key: str
) -> None:
    """Verify a strength receipt offline against a pinned signer.

    Raises a typed ``avow`` error on any failure: tampered content
    (``ReplayMismatch``), an unpinned signer or bad signature (``SignatureInvalid``)."""
    verify_receipt(receipt, expected_public_key=expected_public_key)
