from contextlib import asynccontextmanager
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app


@asynccontextmanager
async def _test_lifespan(_app):
    """Avoid running the app's production-database startup hook in tests."""
    yield


@pytest.fixture
def client():
    """Give every test an isolated in-memory SQLite database."""
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=test_engine,
        autoflush=False,
        autocommit=False,
    )
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _test_lifespan
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.router.lifespan_context = original_lifespan
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()


def create_transaction(
    client,
    *,
    title="Test transaction",
    amount=10.0,
    transaction_type="expense",
    category="Food",
    transaction_date="2026-10-05",
):
    response = client.post(
        "/api/transactions",
        json={
            "title": title,
            "amount": amount,
            "type": transaction_type,
            "category": category,
            "date": transaction_date,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_transaction_trims_text_and_returns_saved_data(client):
    response = client.post(
        "/api/transactions",
        json={
            "title": "  Groceries  ",
            "amount": 42.5,
            "type": "expense",
            "category": "  Food  ",
            "date": "2026-10-05",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["id"] > 0
    assert data["title"] == "Groceries"
    assert data["category"] == "Food"
    assert data["amount"] == 42.5
    assert data["type"] == "expense"
    assert data["date"] == "2026-10-05"

    list_response = client.get("/api/transactions")
    assert list_response.status_code == 200
    assert list_response.json() == [data]


def test_create_transaction_rejects_invalid_amount_and_type(client):
    base_payload = {
        "title": "Invalid transaction",
        "amount": 0,
        "type": "expense",
        "category": "Food",
        "date": "2026-10-05",
    }
    response = client.post("/api/transactions", json=base_payload)
    assert response.status_code == 422

    base_payload["amount"] = 10
    base_payload["type"] = "transfer"
    response = client.post("/api/transactions", json=base_payload)
    assert response.status_code == 422


def test_transaction_filters_and_invalid_date_range(client):
    create_transaction(
        client,
        title="October food",
        amount=20,
        category="Food",
        transaction_date="2026-10-05",
    )
    create_transaction(
        client,
        title="October transport",
        amount=7,
        category="Transport",
        transaction_date="2026-10-06",
    )
    create_transaction(
        client,
        title="September food",
        amount=12,
        category="Food",
        transaction_date="2026-09-05",
    )

    response = client.get(
        "/api/transactions",
        params={
            "type": "expense",
            "category": "Food",
            "date_from": "2026-10-01",
            "date_to": "2026-10-31",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "October food"

    invalid_range = client.get(
        "/api/transactions",
        params={
            "date_from": "2026-10-31",
            "date_to": "2026-10-01",
        },
    )
    assert invalid_range.status_code == 422


def test_update_and_delete_transaction(client):
    transaction = create_transaction(client, title="Old title", amount=25)
    transaction_id = transaction["id"]

    update_response = client.patch(
        f"/api/transactions/{transaction_id}",
        json={"title": "Updated title", "amount": 30},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["title"] == "Updated title"
    assert updated["amount"] == 30

    missing_fields_response = client.patch(
        f"/api/transactions/{transaction_id}",
        json={},
    )
    assert missing_fields_response.status_code == 400

    delete_response = client.delete(f"/api/transactions/{transaction_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["id"] == transaction_id
    assert client.get("/api/transactions").json() == []

    missing_response = client.delete(f"/api/transactions/{transaction_id}")
    assert missing_response.status_code == 404


def test_monthly_analytics_totals_and_category_breakdown(client):
    create_transaction(
        client,
        title="Salary",
        amount=2000,
        transaction_type="income",
        category="Work",
        transaction_date="2026-10-02",
    )
    create_transaction(
        client,
        title="Groceries",
        amount=150,
        category="Food",
        transaction_date="2026-10-02",
    )
    create_transaction(
        client,
        title="Bus",
        amount=50,
        category="Transport",
        transaction_date="2026-10-03",
    )
    create_transaction(
        client,
        title="September expense",
        amount=999,
        category="Food",
        transaction_date="2026-09-03",
    )

    response = client.get("/api/analytics", params={"year": 2026, "month": 10})

    assert response.status_code == 200
    data = response.json()
    assert data["income"] == 2000
    assert data["expenses"] == 200
    assert data["net"] == 1800
    assert data["transaction_count"] == 3
    assert len(data["daily_expenses"]) == 31
    assert data["daily_expenses"][1] == {"date": "2026-10-02", "amount": 150}
    assert data["expense_by_category"] == [
        {"category": "Food", "amount": 150},
        {"category": "Transport", "amount": 50},
    ]


def test_budget_create_update_and_over_budget_calculation(client):
    create_transaction(
        client,
        title="Groceries",
        amount=300,
        category="Food",
        transaction_date="2026-10-02",
    )
    create_transaction(
        client,
        title="Food refund income",
        amount=900,
        transaction_type="income",
        category="Food",
        transaction_date="2026-10-03",
    )
    create_transaction(
        client,
        title="Next month groceries",
        amount=100,
        category="Food",
        transaction_date="2026-11-01",
    )
    create_transaction(
        client,
        title="Transport",
        amount=50,
        category="Transport",
        transaction_date="2026-10-04",
    )

    payload = {
        "year": 2026,
        "month": 10,
        "category": "Food",
        "limit_amount": 500,
    }
    create_response = client.post("/api/budgets", json=payload)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["spent"] == 300
    assert created["remaining"] == 200
    assert created["over_by"] == 0
    assert created["usage_percent"] == 60
    assert created["is_warning"] is False
    assert created["is_over_budget"] is False

    payload["limit_amount"] = 250
    update_response = client.post("/api/budgets", json=payload)
    assert update_response.status_code == 200
    updated = update_response.json()

    assert updated["id"] == created["id"]
    assert updated["limit_amount"] == 250
    assert updated["spent"] == 300
    assert updated["remaining"] == 0
    assert updated["over_by"] == 50
    assert updated["usage_percent"] == 120
    assert updated["is_warning"] is False
    assert updated["is_over_budget"] is True

    list_response = client.get(
        "/api/budgets",
        params={"year": 2026, "month": 10},
    )
    assert list_response.status_code == 200
    budgets = list_response.json()
    assert len(budgets) == 1
    assert budgets[0]["category"] == "Food"


def test_budget_warning_at_eighty_percent_and_delete(client):
    create_transaction(
        client,
        title="Food shopping",
        amount=80,
        category="Food",
        transaction_date="2026-10-08",
    )
    response = client.post(
        "/api/budgets",
        json={
            "year": 2026,
            "month": 10,
            "category": "Food",
            "limit_amount": 100,
        },
    )

    assert response.status_code == 200
    budget = response.json()
    assert budget["usage_percent"] == 80
    assert budget["is_warning"] is True
    assert budget["is_over_budget"] is False

    delete_response = client.delete(f"/api/budgets/{budget['id']}")
    assert delete_response.status_code == 200
    assert client.get(
        "/api/budgets",
        params={"year": 2026, "month": 10},
    ).json() == []

    missing_response = client.delete(f"/api/budgets/{budget['id']}")
    assert missing_response.status_code == 404


def test_budget_validation_rejects_invalid_month_and_limit(client):
    invalid_month = client.post(
        "/api/budgets",
        json={
            "year": 2026,
            "month": 13,
            "category": "Food",
            "limit_amount": 100,
        },
    )
    assert invalid_month.status_code == 422

    invalid_limit = client.post(
        "/api/budgets",
        json={
            "year": 2026,
            "month": 10,
            "category": "Food",
            "limit_amount": 0,
        },
    )
    assert invalid_limit.status_code == 422

    blank_category = client.post(
        "/api/budgets",
        json={
            "year": 2026,
            "month": 10,
            "category": "   ",
            "limit_amount": 100,
        },
    )
    assert blank_category.status_code == 422
