"""Modo de ensaio: casos fictícios para treinar a coordenação.

Os casos passam pela triagem real (`criar_caso`) e são marcados com
`simulacao=1`. Só contêm nomes inventados e nunca têm anexos.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from .casos import adicionar_mensagem, caso_por_codigo, criar_caso
from .config import Config
from .uploads import AnexoInvalido, caminho_anexo

# (tipo, relato, em_andamento, identificado, mensagens)
# mensagens: lista de (autor, texto). A prioridade sai da triagem, não daqui.
_MODELOS: tuple[tuple[str, str, bool, bool, tuple[tuple[str, str], ...]], ...] = (
    ("ameaca", "Um colega disse no corredor que vai te bater depois da aula "
               "se eu contar para alguém.", True, False,
     (("coordenacao", "Recebemos o relato. Você está em segurança agora?"),
      ("aluno", "Estou na biblioteca, mas tenho medo de sair."))),
    ("ameaca", "Recebi mensagens dizendo que vão me pegar na saída. "
               "Uma delas fala em arma.", False, True, ()),
    ("aliciamento", "Um perfil desconhecido pede para eu manter segredo e "
                    "insiste em encontros.", True, False,
     (("coordenacao", "Obrigado por avisar. Não responda mais ao perfil."),)),
    ("vazamento", "Estão circulando uma foto intima de uma colega na turma. "
                  "Querem vazar foto de outras meninas.", False, False, ()),
    ("golpe", "Pedem dinheiro por mensagem e dizem que vou postar tudo se eu "
              "nao fizer o deposito. Parece chantagem.", True, True,
     (("aluno", "Já bloqueei o número, mas ele criou outro."),)),
    ("cyberbullying", "Fizeram um grupo para zombar de mim todos os dias e "
                      "isso está acontecendo agora.", True, True,
     (("coordenacao", "Vamos conversar com a turma com cuidado. Pode nos "
                      "contar quando começou?"),
      ("aluno", "Começou faz duas semanas."))),
    ("cyberbullying", "Mandam figurinhas ofensivas sobre o meu cabelo no "
                      "grupo da sala, e continuam hoje.", True, False, ()),
    ("perfil_falso", "Criaram um perfil com o meu nome e fotos para "
                     "falar mal dos professores.", True, True, ()),
    ("golpe", "Um link prometia prêmio em jogo e roubou a senha da conta "
              "de um colega.", False, False,
     (("coordenacao", "Oriente seu colega a trocar a senha hoje."),)),
    ("vazamento", "Meu endereço apareceu em um grupo de mensagens da "
                  "escola sem eu autorizar.", False, True, ()),
    ("ameaca", "Alguém escreveu no banheiro um aviso de que vai aparecer "
               "na escola com uma faca.", False, False, ()),
    ("cyberbullying", "Comentários maldosos nas minhas fotos, de vez em "
                      "quando, de contas sem foto.", False, False, ()),
    ("cyberbullying", "Um colega repete apelidos ofensivos nas "
                      "mensagens do grupo de trabalho.", False, True, ()),
    ("perfil_falso", "Vi um perfil falso de uma professora publicando "
                     "piadas de mau gosto.", False, False, ()),
    ("outro", "Recebi uma mensagem estranha de um número desconhecido e "
              "fiquei sem saber o que fazer.", False, False,
     (("coordenacao", "Pode nos contar mais detalhes quando se sentir "
                      "confortável."),)),
    ("outro", "Quero saber como denunciar um conteúdo que me incomodou "
              "em uma rede social.", False, True, ()),
    ("outro", "Percebi que um colega está mais isolado e talvez esteja "
              "sofrendo com algo online.", False, False, ()),
    ("perfil_falso", "Um perfil novo copia as fotos que eu publico, mas "
                     "ainda não fez nada com elas.", False, False, ()),
)

_TURMAS = ("6ºA", "7ºA", "7ºB", "8ºA", "9ºB", "1º EM")


def carregar_simulacao(conn: sqlite3.Connection, config: Config,
                       quantidade: int = 18) -> int:
    """Cria casos fictícios; devolve quantos criou (0 se já há simulação)."""
    if conn.execute("SELECT 1 FROM casos WHERE simulacao = 1 LIMIT 1").fetchone():
        return 0
    agora = datetime.now(timezone.utc)
    criados = 0
    for i in range(quantidade):
        tipo, relato, andamento, identificado, mensagens = _MODELOS[i % len(_MODELOS)]
        dados = {"tipo": tipo, "relato": relato, "em_andamento": andamento,
                 "anonimo": not identificado}
        if identificado:
            dados["nome"] = f"Aluno Exemplo {i + 1}"
            dados["turma"] = _TURMAS[i % len(_TURMAS)]
        quando = (agora - timedelta(hours=7 * (quantidade - i))).isoformat(
            timespec="seconds")
        # nasce já marcado e datado; o código em claro é descartado
        codigo = criar_caso(conn, config, dados, [], simulacao=True,
                            criado_em=quando)
        # busca pelo código (não por MAX(id)): denúncias reais podem chegar junto
        caso_id = caso_por_codigo(conn, config, codigo)["id"]
        del codigo
        for autor, texto in mensagens:
            adicionar_mensagem(conn, caso_id, autor, texto)
        criados += 1
    return criados


def remover_simulacao(conn: sqlite3.Connection,
                      config: Config | None = None) -> int:
    """Apaga só os casos `simulacao=1`; os filhos saem por ON DELETE CASCADE.

    Se algum tivesse arquivo de anexo (não deveria), o arquivo também é apagado.
    """
    arquivos = [
        r[0] for r in conn.execute(
            "SELECT a.nome_interno FROM anexos a JOIN casos c ON c.id = a.caso_id "
            "WHERE c.simulacao = 1")
    ]
    cur = conn.execute("DELETE FROM casos WHERE simulacao = 1")
    removidos = cur.rowcount
    conn.commit()
    if config is not None:
        for nome in arquivos:
            try:
                caminho_anexo(config, nome).unlink(missing_ok=True)
            except (AnexoInvalido, OSError):
                pass
    return removidos
