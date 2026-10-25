from datetime import date as DateType

from sqlalchemy import Date, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    title: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    # Float оставлен как в текущей версии проекта.
    # Денежный тип лучше улучшить отдельной миграцией.
    amount: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    type: Mapped[str] = mapped_column(
        String(10),
        nullable=False
    )

    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    date: Mapped[DateType | None] = mapped_column(
        Date,
        nullable=True,
        default=DateType.today
    )
