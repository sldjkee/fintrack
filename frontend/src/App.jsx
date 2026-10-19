
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    amount: "",
    type: "expense",
    category: "Другое"
  });

  async function loadData() {
    try {
      const [transactionsResponse, balanceResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/transactions`),
          fetch(`${API_URL}/api/balance`)
        ]);

      if (!transactionsResponse.ok || !balanceResponse.ok) {
        throw new Error("Ошибка загрузки данных");
      }

      const transactionsData = await transactionsResponse.json();
      const balanceData = await balanceResponse.json();

      setTransactions(transactionsData);
      setBalance(balanceData);
      setError("");
    } catch (err) {
      setError("Не удалось загрузить данные с сервера");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    const amount = Number(form.amount);

    if (
      !form.title.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError("Введите название и корректную сумму");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/transactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...form,
            title: form.title.trim(),
            amount
          })
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось добавить операцию");
      }

      setForm({
        title: "",
        amount: "",
        type: "expense",
        category: "Другое"
      });

      await loadData();
    } catch (err) {
      setError("Ошибка при сохранении операции");
    } finally {
      setLoading(false);
    }
  }

  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const expenses = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const money = (value) =>
    Number(value).toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>◈ FinTrack</h2>
        <nav>
          <div className="active">Обзор</div>
          <div>Транзакции</div>
          <div>Аналитика</div>
          <div>Настройки</div>
        </nav>
      </aside>

      <main className="content">
        <header>
          <div>
            <p className="subtitle">Личные финансы</p>
            <h1>Обзор финансов</h1>
          </div>
          <span className="demo">Demo Mode</span>
        </header>

        <section className="balance-card">
          <p>Общий баланс</p>
          <h2>
            {balance
              ? `${money(balance.balance)} ${balance.currency}`
              : "Загрузка..."}
          </h2>
        </section>

        <section className="stats">
          <div className="stat-card">
            <p>Всего доходов</p>
            <h2 className="income">+ {money(income)} ₽</h2>
          </div>

          <div className="stat-card">
            <p>Всего расходов</p>
            <h2>− {money(expenses)} ₽</h2>
          </div>
        </section>

        <section className="transactions">
          <h3>Добавить операцию</h3>

          <form onSubmit={handleSubmit} className="transaction-form">
            <input
              placeholder="Название операции"
              value={form.title}
              maxLength={100}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
              required
            />

            <input
              type="number"
              placeholder="Сумма"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value })
              }
              required
            />

            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value })
              }
            >
              <option value="expense">Расход</option>
              <option value="income">Доход</option>
            </select>

            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
            >
              <option value="Другое">Другое</option>
              <option value="Еда">Еда</option>
              <option value="Транспорт">Транспорт</option>
              <option value="Работа">Работа</option>
              <option value="Развлечения">Развлечения</option>
            </select>

            <button type="submit" disabled={loading}>
              {loading ? "Сохранение..." : "+ Добавить операцию"}
            </button>
          </form>

          {error && <p className="form-error">{error}</p>}
        </section>

        <section className="transactions">
          <h3>История операций</h3>

          {transactions.length === 0 ? (
            <p className="subtitle">Операций пока нет</p>
          ) : (
            transactions.map((item) => (
              <div className="transaction" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p className="subtitle">{item.category}</p>
                </div>

                <strong className={item.type === "income" ? "income" : ""}>
                  {item.type === "income" ? "+" : "−"}
                  {money(item.amount)} ₽
                </strong>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
