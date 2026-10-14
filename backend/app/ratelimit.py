"""Limitador de taxa em memória (janela deslizante por chave).

Nada é persistido: as chaves existem só enquanto o processo roda.
"""
import threading
import time
from collections import deque
from typing import Callable


class Limitador:
    def __init__(self, max_eventos: int, janela_s: int,
                 relogio: Callable[[], float] = time.monotonic):
        self.max_eventos = max_eventos
        self.janela_s = janela_s
        self._relogio = relogio
        self._eventos: dict[str, deque] = {}
        self._trava = threading.Lock()

    def permitir(self, chave: str) -> bool:
        """Registra o evento e devolve True se ainda está dentro do limite.

        Tentativas negadas não são registradas, então o bloqueio acaba
        quando os eventos aceitos saem da janela.
        """
        agora = self._relogio()
        corte = agora - self.janela_s
        with self._trava:
            fila = self._eventos.get(chave)
            if fila is None:
                fila = self._eventos[chave] = deque()
            while fila and fila[0] <= corte:
                fila.popleft()
            if len(fila) >= self.max_eventos:
                return False
            fila.append(agora)
            # Descarta chaves ociosas para não crescer sem limite.
            if len(self._eventos) > 10000:
                for k in [k for k, f in self._eventos.items()
                          if not f or f[-1] <= corte]:
                    del self._eventos[k]
            return True
