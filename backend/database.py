
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# Папка, в которой находится database.py
BASE_DIR = Path(__file__).resolve().parent

# Путь к файлу базы данных
DB_PATH = BASE_DIR / "fintrack.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Подключение к SQLite
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# Фабрика сессий для работы с базой
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False
)


# Родительский класс для моделей базы данных
class Base(DeclarativeBase):
    pass


# Сессия на один запрос
def get_db():
    with SessionLocal() as db:
        yield db
