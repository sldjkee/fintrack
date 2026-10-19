
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Transaction


# Создание отсутствующих таблиц при запуске
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="FinTrack API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Тип для получения сессии базы данных
DBSession = Annotated[Session, Depends(get_db)]


# Проверка данных новой операции
class TransactionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0, allow_inf_nan=False)
    type: Literal["income", "expense"]
    category: str = Field(min_length=1, max_length=50)


# Преобразование записи БД в обычный словарь
def serialize_transaction(item: Transaction):
    return {
        "id": item.id,
        "title": item.title,
        "amount": item.amount,
        "type": item.type,
        "category": item.category,
    }


@app.get("/")
def home():
    return {"message": "FinTrack API is working"}


# Получение всех транзакций
@app.get("/api/transactions")
def get_transactions(db: DBSession):
    result = db.scalars(
        select(Transaction).order_by(Transaction.id.desc())
    ).all()

    return [
        serialize_transaction(item)
        for item in result
    ]


# Добавление новой транзакции
@app.post("/api/transactions", status_code=201)
def create_transaction(
    data: TransactionCreate,
    db: DBSession
):
    transaction = Transaction(
        title=data.title,
        amount=data.amount,
        type=data.type,
        category=data.category
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return serialize_transaction(transaction)


# Расчёт баланса
@app.get("/api/balance")
def get_balance(db: DBSession):
    transactions = db.scalars(
        select(Transaction)
    ).all()

    balance = 0.0

    for transaction in transactions:
        if transaction.type == "income":
            balance += transaction.amount
        else:
            balance -= transaction.amount

    return {
        "balance": round(balance, 2),
        "currency": "RUB"
    }
