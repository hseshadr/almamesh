"""The domain's defining divisional chart, summarized for its key graha.

Pure read-only lookup over the already-computed ``VargaContext`` — the varga
engine remains the single source of divisional truth. ``same_sign_as_d1`` is the
honest generalized marker (D1 sign repeats in THIS varga, whichever it is);
``vargottama`` is claimed ONLY for the D9 Navamsa, where that repeat is the
classical BPHS vargottama.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from almamesh.schemas.domains import VargaPlacementSummary
from almamesh.schemas.vargas import DivisionalChart

if TYPE_CHECKING:
    from almamesh.domains.recipes import DomainRecipe
    from almamesh.schemas.vargas import VargaContext


def varga_summary(vargas: VargaContext, recipe: DomainRecipe) -> VargaPlacementSummary:
    """The key graha's placement in the domain's defining varga chart."""
    placed = vargas.charts[recipe.varga.chart].placements[recipe.key_graha]
    d1_sign = vargas.charts[DivisionalChart.D1].placements[recipe.key_graha].sign
    same_sign = d1_sign == placed.sign
    return VargaPlacementSummary(
        chart=recipe.varga.chart,
        graha=recipe.key_graha,
        sign=placed.sign,
        sign_lord=placed.sign_lord,
        same_sign_as_d1=same_sign,
        vargottama=same_sign and recipe.varga.chart is DivisionalChart.D9,
        rule=recipe.varga.rule,
    )
