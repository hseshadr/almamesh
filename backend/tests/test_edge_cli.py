"""The offline chart CLI: birth data in, sidereal chart out, no network."""

from almamesh.edge.cli import main


def test_cli_prints_chart(capsys) -> None:
    code = main(["1990-01-15T12:00:00+00:00", "40.7128", "-74.0060"])
    out = capsys.readouterr().out
    assert code == 0
    assert "lagna" in out
    assert "planets" in out


def test_cli_fails_closed_on_bad_input(capsys) -> None:
    code = main(["not-a-date", "40.0", "-74.0"])
    assert code == 1
    assert "error" in capsys.readouterr().err
