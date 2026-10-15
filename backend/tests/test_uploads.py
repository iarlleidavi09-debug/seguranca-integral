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

from imagens import (
    bloco_png, bloco_riff, extensao_gif, gif, jpeg, png, segmento_jpeg, webp,
    webp_simples,
)

# imagens mínimas válidas, sem metadados: a limpeza não muda nenhum byte
PNG = png()
JPEG = jpeg()
GIF89 = gif()
GIF87 = b"GIF87a" + GIF89[6:]
WEBP = webp_simples()

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


def _png_com_tamanho(total: int) -> bytes:
    """PNG válido de exatamente `total` bytes (bloco auxiliar de enchimento)."""
    enchimento = total - len(PNG) - 12  # 12 = tamanho, tipo e CRC do bloco
    return png([bloco_png(b"pdNg", b"\x00" * enchimento)])


def test_acima_de_5mb_rejeitado(config):
    assert MAX_BYTES == 5 * 1024 * 1024
    with pytest.raises(AnexoInvalido):
        salvar_anexo(config, _png_com_tamanho(MAX_BYTES + 1))
    # nada gravado após a rejeição
    pasta = config.uploads_dir
    assert not pasta.exists() or not any(pasta.iterdir())


def test_exatamente_5mb_aceito(config):
    dados = _png_com_tamanho(MAX_BYTES)
    assert len(dados) == MAX_BYTES
    salvo = salvar_anexo(config, dados)
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


# --- remoção de metadados ---------------------------------------------------

EXIF = b"Exif\x00\x00GPSLatitude-23.55"
SEGREDO = b"SECRET-CAMERA"


def _gravado(config, dados):
    salvo = salvar_anexo(config, dados)
    final = (config.uploads_dir / salvo.nome_interno).read_bytes()
    assert salvo.tamanho == len(final)
    return final


def _sem_marcas(dados):
    assert b"GPSLatitude" not in dados
    assert SEGREDO not in dados


def test_jpeg_perde_exif_xmp_e_comentario(config):
    sujo = jpeg([segmento_jpeg(0xE1, EXIF),
                 segmento_jpeg(0xE1, b"http://ns.adobe.com/xap/1.0/\x00" + SEGREDO),
                 segmento_jpeg(0xE2, b"ICC_PROFILE\x00" + SEGREDO),
                 segmento_jpeg(0xED, b"Photoshop 3.0\x00" + SEGREDO),
                 segmento_jpeg(0xFE, SEGREDO)])
    final = _gravado(config, sujo)
    _sem_marcas(final)
    assert final.startswith(b"\xff\xd8\xff\xe0") and final.endswith(b"\xff\xd9")
    assert b"JFIF\x00" in final
    assert final == jpeg()  # o resto da imagem fica intacto


def test_jpeg_descarta_dados_depois_do_fim_da_imagem(config):
    # celulares anexam vídeo e metadados depois do FFD9 (motion photo, SEFT)
    final = _gravado(config, jpeg(apos_eoi=b"\x00\x00ftypmp4" + SEGREDO))
    _sem_marcas(final)
    assert final == jpeg()


def test_jpeg_sem_app0_comeca_direto_no_proximo_segmento(config):
    app0 = 2 + 2 + 14  # marcador, tamanho e JFIF
    sem_app0 = b"\xff\xd8" + segmento_jpeg(0xE1, EXIF) + jpeg()[2 + app0:]
    final = _gravado(config, sem_app0)
    _sem_marcas(final)
    assert final.startswith(b"\xff\xd8\xff\xdb") and final.endswith(b"\xff\xd9")


def test_jpeg_app0_que_nao_e_jfif_tambem_sai(config):
    final = _gravado(config, jpeg([segmento_jpeg(0xE0, b"JFXX\x00" + SEGREDO)]))
    _sem_marcas(final)
    assert final == jpeg()


def test_jpeg_progressivo_limpa_segmentos_entre_varreduras(config):
    base = jpeg()
    fim = base.rindex(b"\xff\xd9")
    segunda = (segmento_jpeg(0xE1, EXIF)
               + segmento_jpeg(0xC4, b"\x00" + b"\x01" + b"\x00" * 15 + b"\x00")
               + segmento_jpeg(0xDA, b"\x01\x01\x00\x00\x3f\x00") + b"\x77\xff\x00")
    final = _gravado(config, base[:fim] + segunda + b"\xff\xd9")
    _sem_marcas(final)
    assert final.endswith(b"\x77\xff\x00\xff\xd9")
    assert final.count(b"\xff\xda") == 2


def test_png_perde_blocos_de_texto_exif_e_data(config):
    sujo = png([bloco_png(b"eXIf", b"MM\x00*" + SEGREDO),
                bloco_png(b"tEXt", b"Comment\x00" + SEGREDO),
                bloco_png(b"iTXt", b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + SEGREDO),
                bloco_png(b"zTXt", b"Raw\x00\x00" + SEGREDO),
                bloco_png(b"tIME", b"\x07\xea\x0a\x0e\x0c\x00\x00")])
    final = _gravado(config, sujo + b"lixo depois do IEND" + SEGREDO)
    _sem_marcas(final)
    assert final.startswith(b"\x89PNG\r\n\x1a\n")
    assert final.endswith(bloco_png(b"IEND", b""))
    assert b"tIME" not in final
    assert final == PNG


def test_png_mantem_plte_e_trns(config):
    extras = [bloco_png(b"PLTE", b"\x00\x00\x00"), bloco_png(b"tRNS", b"\x00")]
    assert _gravado(config, png(extras)) == png(extras)


def test_webp_perde_exif_e_xmp_e_ajusta_cabecalho(config):
    sujo = webp([bloco_riff(b"EXIF", EXIF), bloco_riff(b"XMP ", SEGREDO)],
                flags=0x08 | 0x04 | 0x10)
    final = _gravado(config, sujo + b"lixo" + SEGREDO)
    _sem_marcas(final)
    assert final[:4] == b"RIFF" and final[8:12] == b"WEBP"
    assert int.from_bytes(final[4:8], "little") == len(final) - 8
    # VP8X: bits de EXIF (0x08) e XMP (0x04) limpos, o de alfa (0x10) mantido
    assert final[12:16] == b"VP8X"
    assert final[20] == 0x10
    assert final == webp(flags=0x10)


def test_gif_perde_comentario_e_extensao_de_aplicativo(config):
    sujo = gif([extensao_gif(0xFE, SEGREDO * 30),  # mais de um sub-bloco
                extensao_gif(0xFF, b"XMP DataXMP" + SEGREDO)])
    final = _gravado(config, sujo + SEGREDO)
    _sem_marcas(final)
    assert final.startswith(b"GIF89a") and final.endswith(b"\x3b")
    assert final == gif()


@pytest.mark.parametrize("dados", [
    jpeg([segmento_jpeg(0xFE, b"x")]), png([bloco_png(b"tEXt", b"a\x00b")]),
    gif([extensao_gif(0xFE, b"c")]), webp([bloco_riff(b"EXIF", b"d")], flags=0x08),
])
def test_limpar_duas_vezes_da_o_mesmo_resultado(config, dados):
    uma = _gravado(config, dados)
    assert _gravado(config, uma) == uma


@pytest.mark.parametrize("dados", [
    # JPEG: segmento cortado, tamanho menor que 2, sem fim de imagem, lixo
    jpeg()[:30],
    b"\xff\xd8\xff\xe1\x00\x01" + b"\x00" * 10,
    jpeg()[:-2],
    b"\xff\xd8\xff\x00\x00",
    # PNG: bloco cortado, sem IEND
    PNG[:20],
    PNG[:-12],
    # GIF: sub-bloco cortado, sem trailer, bloco desconhecido
    GIF89[:-4],
    GIF89[:-1],
    GIF89[:-1] + b"\x99",
    # WebP: tamanho declarado maior que o arquivo, bloco cortado
    WEBP[:-3],
    b"RIFF" + (4 + 8 + 100).to_bytes(4, "little") + b"WEBPVP8L"
    + (100).to_bytes(4, "little"),
])
def test_estrutura_corrompida_e_rejeitada(config, dados):
    with pytest.raises(AnexoInvalido) as erro:
        salvar_anexo(config, dados)
    assert erro.value.motivo == "arquivo corrompido"
    pasta = config.uploads_dir
    assert not pasta.exists() or not any(pasta.iterdir())
