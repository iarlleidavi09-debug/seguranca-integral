"""Ponto de entrada do executável (PyInstaller): repassa o código de saída."""
import sys

from app.server import main

if __name__ == "__main__":
    sys.exit(main())
