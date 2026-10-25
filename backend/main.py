import calendar
from contextlib import asynccontextmanager
from datetime import date as DateType
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Transaction


def ensure_transaction_date_column() -> None:
    """
    Add the date column to an older SQLite database if it is missing.
    Existing rows keep a null date because their real date is unknown.
    """
    with engine.begin() as connection:
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("transactions")
        }

        if "date" not in columns:
            connection.exec_driver_sql(
                "ALTER TABLE transactions ADD COLUMN date DATE"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_transaction_date_column()
    yield


app = FastAPI(
    title="FinTrack API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

DBSession = Annotated[Session, Depends(get_db)]


class TransactionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0, allow_inf_nan=False)
    type: Literal["income", "expense"]
    category: str = Field(min_length=1, max_length=50)
    date: DateType = Field(default_factory=DateType.today)

    @field_validator("title", "category")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Поле не может быть пустым")
        return value


class TransactionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    amount: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    type: Literal["income", "expense"] | None = None
    category: str | None = Field(default=None, min_length=1, max_length=50)
    date: DateType | None = None

    @field_validator("title", "category")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Поле не может быть пустым")
        return value


def serialize_transaction(item: Transaction):
    return {
        "id": item.id,
        "title": item.title,
        "amount": item.amount,
        "type": item.type,
        "category": item.category,
        "date": item.date.isoformat() if item.date else None,
    }


@app.get("/")
def home():
    return {"message": "FinTrack API is working"}


@app.get("/api/transactions")
def get_transactions(
    db: DBSession,
    type: Literal["income", "expense"] | None = None,
    category: str | None = Query(default=None, min_length=1, max_length=50),
    date_from: DateType | None = None,
    date_to: DateType | None = None,
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="Дата начала не может быть позже даты окончания",
        )

    statement = select(Transaction)

    if type is not None:
        statement = statement.where(Transaction.type == type)

    if category is not None:
        statement = statement.where(Transaction.category == category.strip())

    if date_from is not None:
        statement = statement.where(Transaction.date >= date_from)

    if date_to is not None:
        statement = statement.where(Transaction.date <= date_to)

    result = db.scalars(
        statement.order_by(Transaction.id.desc())
    ).all()

    return [serialize_transaction(item) for item in result]


@app.post("/api/transactions", status_code=201)
def create_transaction(data: TransactionCreate, db: DBSession):
    transaction = Transaction(
        title=data.title,
        amount=data.amount,
        type=data.type,
        category=data.category,
        date=data.date,
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return serialize_transaction(transaction)


@app.patch("/api/transactions/{transaction_id}")
def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    db: DBSession,
):
    transaction = db.get(Transaction, transaction_id)

    if transaction is None:
        raise HTTPException(
            status_code=404,
            detail="Транзакция не найдена",
        )

    changes = data.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="Не переданы поля для изменения",
        )

    for field, value in changes.items():
        setattr(transaction, field, value)

    db.commit()
    db.refresh(transaction)

    return serialize_transaction(transaction)


@app.delete("/api/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: DBSession):
    transaction = db.get(Transaction, transaction_id)

    if transaction is None:
        raise HTTPException(
            status_code=404,
            detail="Транзакция не найдена",
        )

    db.delete(transaction)
    db.commit()

    return {
        "message": "Транзакция удалена",
        "id": transaction_id,
    }


@app.get("/api/analytics")
def get_monthly_analytics(
    db: DBSession,
    year: int = Query(ge=2000, le=2100),
    month: int = Query(ge=1, le=12),
):
    """
    Return income, expenses, daily expense totals, and category totals
    for one calendar month. Transactions without a known date are excluded.
    """
    first_day = DateType(year, month, 1)
    last_day = DateType(
        year,
        month,
        calendar.monthrange(year, month)[1],
    )

    statement = (
        select(Transaction)
        .where(
            Transaction.date >= first_day,
            Transaction.date <= last_day,
        )
        .order_by(Transaction.date.asc(), Transaction.id.asc())
    )
    transactions = db.scalars(statement).all()

    income_total = 0.0
    expense_total = 0.0
    category_totals: dict[str, float] = {}
    daily_totals = {
        day: 0.0
        for day in range(1, calendar.monthrange(year, month)[1] + 1)
    }

    for transaction in transactions:
        amount = float(transaction.amount)

        if transaction.type == "income":
            income_total += amount
        else:
            expense_total += amount
            category_totals[transaction.category] = (
                category_totals.get(transaction.category, 0.0) + amount
            )
            daily_totals[transaction.date.day] += amount

    daily_expenses = [
        {
            "date": DateType(year, month, day).isoformat(),
            "amount": round(amount, 2),
        }
        for day, amount in daily_totals.items()
    ]

    expense_by_category = [
        {
            "category": category,
            "amount": round(amount, 2),
        }
        for category, amount in sorted(
            category_totals.items(),
            key=lambda item: item[1],
            reverse=True,
        )
    ]

    return {
        "year": year,
        "month": month,
        "income": round(income_total, 2),
        "expenses": round(expense_total, 2),
        "net": round(income_total - expense_total, 2),
        "transaction_count": len(transactions),
        "daily_expenses": daily_expenses,
        "expense_by_category": expense_by_category,
    }


@app.get("/api/balance")
def get_balance(db: DBSession):
    transactions = db.scalars(select(Transaction)).all()

    balance = 0.0

    for transaction in transactions:
        if transaction.type == "income":
            balance += transaction.amount
        else:
            balance -= transaction.amount

    return {
        "balance": round(balance, 2),
        "currency": "RUB",
    }
