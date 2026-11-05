"""Usuários da coordenação: criação, autenticação com bloqueio e listagem.

Regras:
- senha com no mínimo 10 caracteres, guardada só como hash scrypt;
- nome sem espaços nas pontas e único sem diferenciar maiúsculas (casefold,
  vale também para letras acentuadas); o nome é guardado como digitado;
- 5 falhas seguidas bloqueiam por 15 minutos; durante o bloqueio nem a senha
  correta entra e as tentativas não contam; quando o bloqueio expira, o
  contador recomeça do zero;
- usuário inexistente, desativado ou bloqueado gasta uma verificação com hash falso,
  para o tempo de resposta não revelar se a conta existe;
- datas em ISO 8601 UTC, como no resto do código.
"""
from __future__ import annotations

import secrets
import sqlite3
import string
from datetime import datetime, timedelta, timezone

from werkzeug.security import check_password_hash, generate_password_hash

SENHA_MINIMA = 10
MAX_FALHAS = 5
DURACAO_BLOQUEIO = timedelta(minutes=15)
METODO_HASH = "scrypt"

# Sem caracteres que se confundem na leitura (0/O, 1/l/I).
_ALFABETO_SENHA = "".join(
    c for c in string.ascii_letters + string.digits if c not in "0O1lI"
)

# Hash de uma senha aleatória descartada, com o mesmo custo dos reais.
_HASH_FALSO = generate_password_hash(secrets.token_hex(16), method=METODO_HASH)


def _normalizar_nome(nome: str) -> str:
    return nome.strip() if isinstance(nome, str) else ""


def _chave_nome(nome: str) -> str:
    return _normalizar_nome(nome).casefold()


def _buscar_por_nome(conn: sqlite3.Connection, nome: str) -> sqlite3.Row | None:
    """Acha o usuário pelo nome sem diferenciar maiúsculas.

    A tabela da coordenação é pequena; comparar em Python com casefold trata
    acentos, o que o `lower()`/`NOCASE` do SQLite (só ASCII) não faz.
    """
    chave = _chave_nome(nome)
    if not chave:
        return None
    linhas = conn.execute(
        "SELECT id, nome, senha_hash, ativo, tentativas, bloqueado_ate "
        "FROM usuarios ORDER BY id"
    ).fetchall()
    for linha in linhas:
        if linha["nome"].casefold() == chave:
            return linha
    return None


def _utc(agora: datetime) -> datetime:
    if agora.tzinfo is None or agora.utcoffset() is None:
        raise ValueError("agora precisa ter fuso horário (UTC)")
    return agora.astimezone(timezone.utc)


def _iso(momento: datetime) -> str:
    return momento.astimezone(timezone.utc).isoformat(timespec="seconds")


def _bloqueado(linha: sqlite3.Row, agora: datetime) -> bool:
    if not linha["bloqueado_ate"]:
        return False
    return datetime.fromisoformat(linha["bloqueado_ate"]) > agora


PAPEIS = ("admin", "coordenador")


def criar_usuario(conn: sqlite3.Connection, nome: str, senha: str,
                  papel: str = "coordenador", *, so_se_vazio: bool = False) -> int | None:
    """Cria um usuário ativo e devolve o id. Levanta ValueError se inválido.

    Com `so_se_vazio`, a checagem "não há nenhum usuário" e o INSERT ficam na
    mesma transação; se já houver gente, não cria e devolve None.
    """
    nome = _normalizar_nome(nome)
    if not nome:
        raise ValueError("nome vazio")
    if papel not in PAPEIS:
        raise ValueError("papel invalido")
    if not isinstance(senha, str) or len(senha) < SENHA_MINIMA:
        raise ValueError(f"senha precisa de pelo menos {SENHA_MINIMA} caracteres")
    # O hash é caro; calcula antes de pegar o lock de escrita.
    senha_hash = generate_password_hash(senha, method=METODO_HASH)

    conn.execute("BEGIN IMMEDIATE")
    try:
        if so_se_vazio and conn.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone():
            conn.rollback()
            return None
        if _buscar_por_nome(conn, nome) is not None:
            raise ValueError("nome de usuário já existe")
        cur = conn.execute(
            "INSERT INTO usuarios (nome, senha_hash, papel) VALUES (?, ?, ?)",
            (nome, senha_hash, papel),
        )
        conn.commit()
    except sqlite3.IntegrityError as erro:
        conn.rollback()
        raise ValueError("nome de usuário já existe") from erro
    except BaseException:
        conn.rollback()
        raise
    return cur.lastrowid


def criar_primeiro_admin(conn: sqlite3.Connection, nome: str, senha: str) -> int | None:
    """Cria o admin se o banco não tem nenhum usuário; senão devolve None."""
    return criar_usuario(conn, nome, senha, "admin", so_se_vazio=True)


def autenticar(conn: sqlite3.Connection, nome: str, senha: str,
               agora: datetime) -> int | None:
    """Devolve o id do usuário se a senha confere e a conta pode entrar.

    Em duas fases para não segurar o lock de escrita do SQLite durante o
    scrypt: lê e verifica fora de transação; depois, dentro de BEGIN
    IMMEDIATE, relê a linha e aplica o resultado. Quem chega depois do
    bloqueio vê o bloqueio na releitura, então o contador não passa de 5 e
    uma senha certa verificada em paralelo não fura o bloqueio.
    """
    agora = _utc(agora)
    if not isinstance(senha, str):
        senha = ""

    linha = _buscar_por_nome(conn, nome)
    if linha is None or not linha["ativo"]:
        check_password_hash(_HASH_FALSO, senha)
        return None
    if _bloqueado(linha, agora):
        # mesmo custo do caminho de usuário inexistente: o tempo não revela
        # que a conta existe e está bloqueada
        check_password_hash(_HASH_FALSO, senha)
        return None

    usuario_id = linha["id"]
    confere = check_password_hash(linha["senha_hash"], senha)

    conn.execute("BEGIN IMMEDIATE")
    try:
        atual = conn.execute(
            "SELECT ativo, tentativas, bloqueado_ate FROM usuarios WHERE id = ?",
            (usuario_id,),
        ).fetchone()
        if atual is None or not atual["ativo"] or _bloqueado(atual, agora):
            conn.rollback()
            return None

        if confere:
            conn.execute(
                "UPDATE usuarios SET tentativas = 0, bloqueado_ate = NULL "
                "WHERE id = ?",
                (usuario_id,),
            )
            conn.commit()
            return usuario_id

        # Bloqueio já expirado: o contador recomeça do zero.
        base = 0 if atual["bloqueado_ate"] else atual["tentativas"]
        tentativas = base + 1
        bloqueado_ate = None
        if tentativas >= MAX_FALHAS:
            bloqueado_ate = _iso(agora + DURACAO_BLOQUEIO)
        conn.execute(
            "UPDATE usuarios SET tentativas = ?, bloqueado_ate = ? WHERE id = ?",
            (tentativas, bloqueado_ate, usuario_id),
        )
        conn.commit()
        return None
    except BaseException:
        conn.rollback()
        raise


def redefinir_senha(conn: sqlite3.Connection, nome: str, senha: str) -> bool:
    """Troca a senha, zera o bloqueio e reativa a conta.

    Uso local (linha de comando no servidor), para quem perdeu o acesso.
    Devolve False se o usuário não existe. Sessões abertas continuam
    válidas até o prazo de 12 horas.
    """
    if not isinstance(senha, str) or len(senha) < SENHA_MINIMA:
        raise ValueError(f"senha precisa de pelo menos {SENHA_MINIMA} caracteres")
    linha = _buscar_por_nome(conn, nome)
    if linha is None:
        return False
    senha_hash = generate_password_hash(senha, method=METODO_HASH)
    conn.execute(
        "UPDATE usuarios SET senha_hash = ?, tentativas = 0, bloqueado_ate = NULL, "
        "ativo = 1 WHERE id = ?",
        (senha_hash, linha["id"]),
    )
    conn.commit()
    return True


def desativar_usuario(conn: sqlite3.Connection, usuario_id: int) -> None:
    """Marca a conta como inativa (id inexistente não faz nada)."""
    conn.execute("UPDATE usuarios SET ativo = 0 WHERE id = ?", (usuario_id,))
    conn.commit()


def listar_usuarios(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Lista id, nome e ativo. Nunca devolve hash nem contadores."""
    return conn.execute(
        "SELECT id, nome, ativo, papel FROM usuarios ORDER BY nome COLLATE NOCASE, id"
    ).fetchall()


def gerar_senha_inicial() -> str:
    """16 caracteres aleatórios legíveis, com ao menos uma letra e um dígito."""
    while True:
        senha = "".join(secrets.choice(_ALFABETO_SENHA) for _ in range(16))
        if any(c.isdigit() for c in senha) and any(c.isalpha() for c in senha):
            return senha


def remover_usuario(conn: sqlite3.Connection, usuario_id: int, *, atual_id: int) -> str:
    """Remove a conta de vez, mantendo o histórico dos casos sem autor.

    Devolve "ok", "inexistente", "propria", "primeiro_admin" ou "ultimo_admin".
    As colunas que apontam para o usuário viram NULL (o caso continua; só some
    o nome de quem agiu) e as linhas que dependem só dele (leituras) saem por
    ON DELETE CASCADE. Tudo numa transação.
    """
    if usuario_id == atual_id:
        return "propria"
    conn.execute("BEGIN IMMEDIATE")
    try:
        alvo = conn.execute(
            "SELECT papel, ativo FROM usuarios WHERE id = ?", (usuario_id,)
        ).fetchone()
        if alvo is None:
            conn.rollback()
            return "inexistente"
        if alvo["papel"] == "admin":
            primeiro = conn.execute(
                "SELECT MIN(id) FROM usuarios WHERE papel = 'admin'").fetchone()[0]
            if usuario_id == primeiro:
                conn.rollback()
                return "primeiro_admin"
            outros = conn.execute(
                "SELECT COUNT(*) FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND id <> ?",
                (usuario_id,)).fetchone()[0]
            if alvo["ativo"] and outros == 0:
                conn.rollback()
                return "ultimo_admin"
        tabelas = [t[0] for t in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
        for tabela in tabelas:
            for fk in conn.execute(f'PRAGMA foreign_key_list("{tabela}")').fetchall():
                if fk["table"] == "usuarios" and fk["on_delete"].upper() != "CASCADE":
                    conn.execute(
                        f'UPDATE "{tabela}" SET "{fk["from"]}" = NULL WHERE "{fk["from"]}" = ?',
                        (usuario_id,))
        conn.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return "ok"
