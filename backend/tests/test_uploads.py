import builtins
import re
from pathlib import Path

import pytest

from app.uploads import (
    MAX_BYTES,
    AnexoInvalido,
    AnexoSalvo,
    caminho_anexo,
    detectar_tipo,
    salvar_anexo,
)

# cabeçalhos mínimos de cada formato, seguidos de alguns bytes de corpo
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
GIF87 = b"GIF87a" + b"\x00" * 16
GIF89 = b"GIF89a" + b"\x00" * 16
WEBP = b"RIFF" + (20).to_bytes(4, "little") + b"WEBP" + b"VP8 " + b"\x00" * 8

PADRAO_NOME = re.compile(r"[0-9a-f]{32}\.(png|jpg|webp|gif)")


@pytest.mark.parametrize(
    "dados, tipo, ext",
    [(PNG, "png", "png"), (JPEG, "jpeg", "jpg"), (WEBP, "webp", "webp"),
     (GIF87, "gif", "gif"), (GIF89, "gif", "gif")],
)
def test_formatos_validos_sao_aceitos(config, dados, tipo, ext):
    salvo = salvar_anexo(config, dados)
    assert isinstance(salvo, AnexoSalvo)
    assert salvo.tipo == tipo
    assert salvo.tamanho == len(dados)
    assert PADRAO_NOME.fullmatch(salvo.nome_interno)
    assert salvo.nome_interno.endswith("." + ext)
    gravado = config.uploads_dir / salvo.nome_interno
    assert gravado.read_bytes() == dados


def test_detectar_tipo():
    assert detectar_tipo(PNG) == "png"
    assert detectar_tipo(JPEG) == "jpeg"
    assert detectar_tipo(WEBP) == "webp"
    assert detectar_tipo(GIF89) == "gif"
    assert detectar_tipo(b"") is None


@pytest.mark.parametrize(
    "dados",
    [b"\x89PNG", b"\xff\xd8", b"GIF8", b"RIFF\x00\x00\x00\x00WEB",
     b"RIFF\x00\x00\x00\x00WAVE", b"GIF88a" + b"\x00" * 8],
)
def test_cabecalho_truncado_ou_parecido_e_rejeitado(config, dados):
    assert detectar_tipo(dados) is None
    with pytest.raises(AnexoInvalido):
        salvar_anexo(config, dados)


def test_png_falso_com_html_e_rejeitado(config):
    # o nome original (foto.png) não importa; só o conteúdo conta
    with pytest.raises(AnexoInvalido) as erro:
        salvar_anexo(config, b"<html><script>alert(1)</script></html>")
    assert erro.value.motivo


def test_executavel_mz_rejeitado(config):
    with pytest.raises(AnexoInvalido):
        salvar_anexo(config, b"MZ\x90\x00" + b"\x00" * 60)


def test_vazio_rejeitado(config):
    with pytest.raises(AnexoInvalido):
        salvar_anexo(config, b"")


def test_acima_de_5mb_rejeitado(config):
    assert MAX_BYTES == 5 * 1024 * 1024
    with pytest.raises(AnexoInvalido):
        salvar_anexo(config, PNG + b"\x00" * (MAX_BYTES - len(PNG) + 1))
    # nada gravado após a rejeição
    pasta = config.uploads_dir
    assert not pasta.exists() or not any(pasta.iterdir())


def test_exatamente_5mb_aceito(config):
    salvo = salvar_anexo(config, PNG + b"\x00" * (MAX_BYTES - len(PNG)))
    assert salvo.tamanho == MAX_BYTES


def test_nome_interno_aleatorio_e_unico(config):
    nomes = {salvar_anexo(config, PNG).nome_interno for _ in range(50)}
    assert len(nomes) == 50
    assert len(list(config.uploads_dir.iterdir())) == 50


@pytest.mark.parametrize(
    "nome",
    ["../x", "a/b.png", "..\\x.png", "", "x.png",
     "0" * 32 + ".exe", "0" * 32 + ".PNG", "0" * 32 + ".png\n",
     "../" + "0" * 32 + ".png", "C:" + "0" * 32 + ".png", "A" * 32 + ".png"],
)
def test_caminho_anexo_rejeita_traversal(config, nome):
    with pytest.raises(AnexoInvalido):
        caminho_anexo(config, nome)


def test_caminho_anexo_valido_fica_dentro_da_pasta(config):
    salvo = salvar_anexo(config, JPEG)
    caminho = caminho_anexo(config, salvo.nome_interno)
    assert caminho.parent.resolve() == config.uploads_dir.resolve()
    assert caminho.read_bytes() == JPEG
    # aceita também a grafia .jpeg prevista no padrão
    assert caminho_anexo(config, "a" * 32 + ".jpeg").name == "a" * 32 + ".jpeg"


def test_disco_indisponivel(config, monkeypatch):
    def open_falho(*args, **kwargs):
        raise OSError("disco cheio")

    monkeypatch.setattr(builtins, "open", open_falho)
    monkeypatch.setattr(Path, "open", open_falho)
    with pytest.raises(AnexoInvalido) as erro:
        salvar_anexo(config, PNG)
    assert erro.value.motivo == "armazenamento indisponivel"


def test_falha_na_escrita_nao_deixa_arquivo_parcial(config, monkeypatch):
    open_real = builtins.open

    class ArquivoFalho:
        def __init__(self, f):
            self.f = f

        def write(self, _dados):
            raise OSError("disco cheio")

        def close(self):
            self.f.close()

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            self.f.close()

    monkeypatch.setattr(
        builtins, "open", lambda *a, **k: ArquivoFalho(open_real(*a, **k))
    )
    with pytest.raises(AnexoInvalido) as erro:
        salvar_anexo(config, PNG)
    monkeypatch.undo()
    assert erro.value.motivo == "armazenamento indisponivel"
    assert not any(config.uploads_dir.iterdir())


def test_pasta_bloqueada_por_arquivo(config):
    # uploads_dir ocupado por um arquivo comum: mkdir falha com OSError
    config.uploads_dir.write_bytes(b"x")
    with pytest.raises(AnexoInvalido) as erro:
        salvar_anexo(config, PNG)
    assert erro.value.motivo == "armazenamento indisponivel"
