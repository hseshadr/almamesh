"""CLI to publish signed AlmaMesh construct bundles — ``keygen`` + ``bundle``.

Mirrors the edge-reco publisher flow:

    almamesh-bundle keygen ./keys
    almamesh-bundle bundle ./origin ./keys/private.key --version v1 --staging-dir ./staging

``keygen`` writes a raw ed25519 keypair (pin ``public.key`` into the SPA at
build; keep ``private.key`` secret). ``bundle`` signs the engine constructs plus
any staged binaries into a content-addressed origin a device can sync.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from edgeproc.bundles.signing import Ed25519Signer

from almamesh.edge.bundle import (
    generate_keypair_files,
    publish_bundle,
    publish_offline_bundle,
)

app = typer.Typer(name="almamesh-bundle", help="Publish signed AlmaMesh construct bundles.")


@app.command()
def keygen(
    out_dir: Annotated[Path, typer.Argument(help="Directory to write private.key + public.key")],
    force: Annotated[bool, typer.Option(help="Overwrite an existing private.key")] = False,
) -> None:
    """Generate a pinned ed25519 keypair (raw 32-byte, not PEM)."""
    try:
        generate_keypair_files(out_dir / "private.key", out_dir / "public.key", overwrite=force)
    except FileExistsError as exc:
        raise typer.BadParameter(f"{exc} (pass --force to overwrite)") from exc
    typer.echo(f"Wrote keypair to {out_dir} — gitignore private.key, pin public.key into the SPA")


@app.command()
def bundle(
    origin_dir: Annotated[Path, typer.Argument(help="Output origin dir a device can sync")],
    private_key_path: Annotated[Path, typer.Argument(help="Raw ed25519 private key from keygen")],
    version: Annotated[str, typer.Option(help="Bundle version string")] = "v1",
    ephemeris_file: Annotated[
        str | None, typer.Option(help="Ephemeris filename to record (default: settings)")
    ] = None,
    staging_dir: Annotated[
        Path | None, typer.Option(help="Extra files to stage (ephemeris, wheels)")
    ] = None,
    offline: Annotated[
        bool, typer.Option(help="Ship the full offline asset set (wheels + de421 + finals)")
    ] = False,
    almamesh_wheel: Annotated[
        Path | None, typer.Option(help="almamesh wheel (default: backend/dist)")
    ] = None,
    skyfield_data: Annotated[
        Path | None, typer.Option(help="skyfield data dir (default: ~/.skyfield-data)")
    ] = None,
) -> None:
    """Sign engine constructs (+ staged binaries, or the full offline set) into an origin."""
    signer = Ed25519Signer.from_private_bytes(private_key_path.read_bytes())
    if offline:
        pointer = publish_offline_bundle(
            origin_dir,
            signer,
            version=version,
            almamesh_wheel=almamesh_wheel,
            skyfield_data_dir=skyfield_data,
        )
    else:
        pointer = publish_bundle(
            origin_dir,
            signer,
            version=version,
            staging_dir=staging_dir,
            ephemeris_file=ephemeris_file,
        )
    typer.echo(f"Built bundle {pointer.version} → {origin_dir}")
