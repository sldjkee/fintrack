import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function emptyForm() {
  return {
    title: "",
    amount: "",
    type: "expense",
    category: "Другое",
    date: getLocalDateString(),
  };
}

const EMPTY_FILTERS = {
  type: "",
  category: "",
  date_from: "",
  date_to: "",
};

function formatDate(value) {
  if (!value) return "Без даты";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function monthLabel(value) {
  if (!value) return "";
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

function Icon({ name, size = 20 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    list: <><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18" /><path d="M16 14h.01" /><path d="M7 5V3h10v2" /></>,
    arrowUp: <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
    arrowDown: <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1Z" /></>,
    filter: <><path d="M4 7h16M7 12h10M10 17h4" /></>,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}

function App() {
  const [page, setPage] = useState("overview");
  const [allTransactions, setAllTransactions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsMonth, setAnalyticsMonth] = useState(getLocalMonthString);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(filtersToUse = appliedFilters, monthToUse = analyticsMonth) {
    try {
      const params = new URLSearchParams();
      Object.entries(filtersToUse).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const query = params.toString();
      const filteredUrl = query
        ? `${API_URL}/api/transactions?${query}`
        : `${API_URL}/api/transactions`;

      const [allResponse, filteredResponse, balanceResponse, analyticsResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/transactions`),
          fetch(filteredUrl),
          fetch(`${API_URL}/api/balance`),
          fetch(`${API_URL}/api/analytics?year=${monthToUse.split("-")[0]}&month=${Number(monthToUse.split("-")[1])}`),
        ]);

      if (![allResponse, filteredResponse, balanceResponse, analyticsResponse].every((response) => response.ok)) {
        throw new Error("Не удалось загрузить данные");
      }

      const [allData, filteredData, balanceData, analyticsData] = await Promise.all([
        allResponse.json(),
        filteredResponse.json(),
        balanceResponse.json(),
        analyticsResponse.json(),
      ]);

      setAllTransactions(allData);
      setTransactions(filteredData);
      setBalance(balanceData);
      setAnalytics(analyticsData);
      setError("");
    } catch {
      setError("Не удалось загрузить данные с сервера. Проверь, запущен ли backend.");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const incomeAll = useMemo(
    () => allTransactions.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0),
    [allTransactions]
  );
  const expensesAll = useMemo(
    () => allTransactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0),
    [allTransactions]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0 || !form.category.trim() || !form.date) {
      setError("Заполни название, положительную сумму, категорию и дату.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    const isEditing = editingId !== null;

    try {
      const response = await fetch(
        isEditing ? `${API_URL}/api/transactions/${editingId}` : `${API_URL}/api/transactions`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            amount,
            type: form.type,
            category: form.category.trim(),
            date: form.date,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const detail = errorData?.detail;
        throw new Error(typeof detail === "string" ? detail : isEditing ? "Не удалось изменить операцию." : "Не удалось добавить операцию.");
      }

      setEditingId(null);
      setForm(emptyForm());
      setNotice(isEditing ? "Изменения сохранены." : "Операция добавлена.");
      await loadData(appliedFilters, analyticsMonth);
    } catch (err) {
      setError(err.message || "Ошибка при сохранении операции.");
    } finally {
      setLoading(false);
    }
  }

  function startEditing(item) {
    setPage("transactions");
    setEditingId(item.id);
    setForm({
      title: item.title,
      amount: String(item.amount),
      type: item.type,
      category: item.category,
      date: item.date || "",
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setNotice("");
  }

  async function handleDelete(item) {
    if (!window.confirm(`Удалить операцию «${item.title}» на ${formatMoney(item.amount)}?`)) return;
    setDeletingId(item.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/api/transactions/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Не удалось удалить операцию.");
      }
      if (editingId === item.id) cancelEditing();
      setNotice("Операция удалена.");
      await loadData(appliedFilters, analyticsMonth);
    } catch (err) {
      setError(err.message || "Ошибка при удалении операции.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFilterSubmit(event) {
    event.preventDefault();
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
      setError("Дата начала не может быть позже даты окончания.");
      return;
    }
    setAppliedFilters({ ...filters });
    setError("");
    await loadData(filters, analyticsMonth);
  }

  async function resetFilters() {
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
    setError("");
    await loadData({ ...EMPTY_FILTERS }, analyticsMonth);
  }

  async function changeAnalyticsMonth(event) {
    const nextMonth = event.target.value;
    if (!nextMonth) return;
    setAnalyticsMonth(nextMonth);
    await loadData(appliedFilters, nextMonth);
  }

  const navItems = [
    { id: "overview", label: "Обзор", icon: "grid" },
    { id: "transactions", label: "Транзакции", icon: "list" },
    { id: "analytics", label: "Аналитика", icon: "chart" },
  ];

  const titles = {
    overview: ["Обзор", "Краткая сводка твоих финансов."],
    transactions: ["Транзакции", "Управляй доходами и расходами."],
    analytics: ["Аналитика", "Понимай, куда уходят деньги."],
  };

  const maxDaily = Math.max(...(analytics?.daily_expenses || []).map((item) => item.amount), 1);
  const maxCategory = Math.max(...(analytics?.expense_by_category || []).map((item) => item.amount), 1);

  function renderTransactionRow(item, compact = false) {
    return (
      <div className={`ft-transaction-row${compact ? " ft-transaction-row-compact" : ""}`} key={item.id}>
        <div className={`ft-transaction-symbol ${item.type === "income" ? "is-income" : "is-expense"}`}>
          <Icon name={item.type === "income" ? "arrowDown" : "arrowUp"} size={18} />
        </div>
        <div className="ft-transaction-main">
          <strong>{item.title}</strong>
          <span>{item.category} <i>·</i> {formatDate(item.date)}</span>
        </div>
        <strong className={`ft-transaction-amount ${item.type === "income" ? "is-income" : ""}`}>
          {item.type === "income" ? "+" : "−"}{formatMoney(item.amount)}
        </strong>
        {!compact && (
          <div className="ft-row-actions">
            <button type="button" className="ft-icon-button" onClick={() => startEditing(item)} title="Редактировать" aria-label={`Редактировать ${item.title}`}>
              <Icon name="edit" size={17} />
            </button>
            <button type="button" className="ft-icon-button is-danger" onClick={() => handleDelete(item)} disabled={deletingId === item.id} title="Удалить" aria-label={`Удалить ${item.title}`}>
              <Icon name="trash" size={17} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ft-app">
      <aside className="ft-sidebar">
        <div className="ft-brand">
          <div className="ft-brand-mark"><Icon name="wallet" size={23} /></div>
          <div><strong>FinTrack</strong><span>PERSONAL FINANCE</span></div>
        </div>

        <div className="ft-nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav className="ft-nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ft-nav-item${page === item.id ? " is-active" : ""}`}
              onClick={() => { setPage(item.id); setError(""); setNotice(""); }}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {page === item.id && <span className="ft-nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="ft-sidebar-bottom">
          <div className="ft-sidebar-tip">
            <div className="ft-tip-icon"><Icon name="spark" size={18} /></div>
            <strong>Маленький совет</strong>
            <p>Регулярно записывай расходы — так проще заметить привычки и найти возможности для экономии.</p>
          </div>
          <div className="ft-sidebar-footer"><span className="ft-status-dot" /> Локальная база данных</div>
        </div>
      </aside>

      <main className="ft-main">
        <header className="ft-topbar">
          <div className="ft-breadcrumb"><span>FinTrack</span><Icon name="chevron" size={14} /><strong>{titles[page][0]}</strong></div>
          <div className="ft-topbar-right"><span className="ft-today"><Icon name="calendar" size={16} /> {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span></div>
        </header>

        <div className="ft-page">
          <div className="ft-page-heading">
            <div><p className="ft-eyebrow">ТВОИ ДЕНЬГИ — ПОД КОНТРОЛЕМ</p><h1>{titles[page][0]}</h1><p className="ft-page-description">{titles[page][1]}</p></div>
            {page !== "transactions" && <button className="ft-primary-button" onClick={() => { setPage("transactions"); setEditingId(null); setForm(emptyForm()); }}><Icon name="plus" size={18} /> Добавить операцию</button>}
          </div>

          {error && <div className="ft-alert is-error" role="alert">{error}</div>}
          {notice && <div className="ft-alert is-success" role="status">{notice}</div>}

          {page === "overview" && (
            <>
              <section className="ft-overview-grid">
                <div className="ft-balance-card">
                  <div className="ft-card-label"><span>ОБЩИЙ БАЛАНС</span><span className="ft-balance-icon"><Icon name="wallet" size={19} /></span></div>
                  <div className="ft-balance-value">{balance ? formatMoney(balance.balance) : "Загрузка…"}</div>
                  <div className="ft-balance-foot"><span className="ft-balance-pulse" /> По всем операциям</div>
                  <div className="ft-balance-decoration" />
                </div>
                <div className="ft-summary-card">
                  <div className="ft-summary-top"><span className="ft-summary-icon is-income"><Icon name="arrowDown" size={18} /></span><span className="ft-summary-label">Все доходы</span></div>
                  <strong className="ft-summary-value">{formatMoney(incomeAll)}</strong>
                  <span className="ft-summary-foot">За всё время</span>
                </div>
                <div className="ft-summary-card">
                  <div className="ft-summary-top"><span className="ft-summary-icon is-expense"><Icon name="arrowUp" size={18} /></span><span className="ft-summary-label">Все расходы</span></div>
                  <strong className="ft-summary-value">{formatMoney(expensesAll)}</strong>
                  <span className="ft-summary-foot">За всё время</span>
                </div>
              </section>

              <section className="ft-panel">
                <div className="ft-panel-heading">
                  <div><h2>Этот месяц</h2><p>Финансовый результат за {monthLabel(analyticsMonth)}</p></div>
                  <button type="button" className="ft-text-button" onClick={() => setPage("analytics")}>Подробная аналитика <Icon name="chevron" size={15} /></button>
                </div>
                <div className="ft-month-summary">
                  <div><span>Доходы</span><strong className="ft-green">{formatMoney(analytics?.income)}</strong></div>
                  <div><span>Расходы</span><strong>{formatMoney(analytics?.expenses)}</strong></div>
                  <div><span>Разница</span><strong className={(analytics?.net ?? 0) >= 0 ? "ft-green" : "ft-red"}>{(analytics?.net ?? 0) > 0 ? "+" : ""}{formatMoney(analytics?.net)}</strong></div>
                </div>
              </section>

              <section className="ft-panel">
                <div className="ft-panel-heading">
                  <div><h2>Последние операции</h2><p>Недавно добавленные транзакции</p></div>
                  <button type="button" className="ft-text-button" onClick={() => setPage("transactions")}>Все транзакции <Icon name="chevron" size={15} /></button>
                </div>
                {allTransactions.length ? (
                  <div className="ft-transaction-list">{allTransactions.slice(0, 5).map((item) => renderTransactionRow(item, true))}</div>
                ) : (
                  <div className="ft-empty-state"><span className="ft-empty-icon"><Icon name="list" size={22} /></span><strong>Пока нет операций</strong><p>Добавь первую транзакцию, чтобы начать отслеживать финансы.</p><button className="ft-primary-button" onClick={() => setPage("transactions")}><Icon name="plus" size={17} /> Добавить операцию</button></div>
                )}
              </section>
            </>
          )}

          {page === "transactions" && (
            <>
              <section className="ft-panel">
                <div className="ft-panel-heading">
                  <div><h2>{editingId !== null ? "Редактирование операции" : "Новая операция"}</h2><p>{editingId !== null ? "Измени нужные поля и сохрани результат." : "Запиши доход или расход, чтобы история оставалась актуальной."}</p></div>
                  {editingId !== null && <button className="ft-text-button" onClick={cancelEditing}><Icon name="close" size={16} /> Отмена</button>}
                </div>
                <form className="ft-transaction-form" onSubmit={handleSubmit}>
                  <label className="ft-field ft-field-wide"><span>Название</span><input value={form.title} maxLength={100} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Например, продукты" required /></label>
                  <label className="ft-field"><span>Сумма, ₽</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0,00" required /></label>
                  <label className="ft-field"><span>Тип операции</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="expense">Расход</option><option value="income">Доход</option></select></label>
                  <label className="ft-field"><span>Категория</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="Другое">Другое</option><option value="Еда">Еда</option><option value="Транспорт">Транспорт</option><option value="Работа">Работа</option><option value="Развлечения">Развлечения</option></select></label>
                  <label className="ft-field"><span>Дата</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
                  <div className="ft-form-submit"><button className="ft-primary-button" type="submit" disabled={loading}><Icon name={editingId !== null ? "edit" : "plus"} size={17} />{loading ? "Сохранение…" : editingId !== null ? "Сохранить изменения" : "Добавить операцию"}</button></div>
                </form>
              </section>

              <section className="ft-panel">
                <div className="ft-panel-heading"><div><h2>История операций</h2><p>Всего в выборке: {transactions.length}</p></div><span className="ft-count-pill">{transactions.length}</span></div>
                <form className="ft-filter-form" onSubmit={handleFilterSubmit}>
                  <label className="ft-field"><span>Тип</span><select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Все типы</option><option value="income">Доходы</option><option value="expense">Расходы</option></select></label>
                  <label className="ft-field"><span>Категория</span><select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">Все категории</option><option value="Другое">Другое</option><option value="Еда">Еда</option><option value="Транспорт">Транспорт</option><option value="Работа">Работа</option><option value="Развлечения">Развлечения</option></select></label>
                  <label className="ft-field"><span>Дата с</span><input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} /></label>
                  <label className="ft-field"><span>Дата по</span><input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} /></label>
                  <div className="ft-filter-actions"><button type="submit" className="ft-primary-button"><Icon name="filter" size={17} /> Применить</button><button type="button" className="ft-secondary-button" onClick={resetFilters}>Сбросить</button></div>
                </form>

                {transactions.length ? <div className="ft-transaction-list">{transactions.map((item) => renderTransactionRow(item))}</div> : <div className="ft-empty-state"><span className="ft-empty-icon"><Icon name="filter" size={22} /></span><strong>Ничего не найдено</strong><p>Измени фильтры или добавь новую операцию.</p></div>}
              </section>
            </>
          )}

          {page === "analytics" && (
            <>
              <section className="ft-panel ft-analytics-toolbar">
                <div><h2>Финансовая сводка</h2><p>Данные за выбранный календарный месяц.</p></div>
                <label className="ft-field ft-month-field"><span>Выбранный месяц</span><input type="month" value={analyticsMonth} onChange={changeAnalyticsMonth} /></label>
              </section>

              <section className="ft-analytics-cards">
                <div className="ft-summary-card"><div className="ft-summary-top"><span className="ft-summary-icon is-income"><Icon name="arrowDown" size={18} /></span><span className="ft-summary-label">Доходы</span></div><strong className="ft-summary-value ft-green">{formatMoney(analytics?.income)}</strong><span className="ft-summary-foot">За {monthLabel(analyticsMonth)}</span></div>
                <div className="ft-summary-card"><div className="ft-summary-top"><span className="ft-summary-icon is-expense"><Icon name="arrowUp" size={18} /></span><span className="ft-summary-label">Расходы</span></div><strong className="ft-summary-value">{formatMoney(analytics?.expenses)}</strong><span className="ft-summary-foot">За {monthLabel(analyticsMonth)}</span></div>
                <div className="ft-summary-card"><div className="ft-summary-top"><span className="ft-summary-icon is-net"><Icon name="chart" size={18} /></span><span className="ft-summary-label">Разница</span></div><strong className={`ft-summary-value ${(analytics?.net ?? 0) >= 0 ? "ft-green" : "ft-red"}`}>{(analytics?.net ?? 0) > 0 ? "+" : ""}{formatMoney(analytics?.net)}</strong><span className="ft-summary-foot">{analytics?.transaction_count ?? 0} операций с датой</span></div>
              </section>

              <section className="ft-panel">
                <div className="ft-panel-heading"><div><h2>Расходы по дням</h2><p>Сумма расходов за каждый день месяца</p></div><span className="ft-muted-pill">{monthLabel(analyticsMonth)}</span></div>
                {analytics?.expenses > 0 ? (
                  <div className="ft-daily-chart" aria-label="Расходы по дням">
                    {(analytics?.daily_expenses || []).map((item, index, list) => {
                      const height = item.amount > 0 ? Math.max((item.amount / maxDaily) * 100, 4) : 0;
                      const day = Number(item.date.slice(-2));
                      const showLabel = day === 1 || day % 5 === 0 || index === list.length - 1;
                      return <div className="ft-daily-column" key={item.date} title={`${formatDate(item.date)}: ${formatMoney(item.amount)}`}><div className="ft-daily-value">{item.amount > 0 ? formatMoney(item.amount).replace(" ₽", "") : ""}</div><div className="ft-daily-bar-wrap"><div className={`ft-daily-bar${item.amount > 0 ? " has-value" : ""}`} style={{ height: `${height}%` }} /></div><span>{showLabel ? day : ""}</span></div>;
                    })}
                  </div>
                ) : <div className="ft-chart-empty"><span className="ft-empty-icon"><Icon name="chart" size={22} /></span><strong>Пока нет расходов за этот месяц</strong><p>Когда появятся операции с датой, здесь отобразится график.</p></div>}
              </section>

              <section className="ft-panel">
                <div className="ft-panel-heading"><div><h2>Расходы по категориям</h2><p>От самой затратной категории к меньшей</p></div></div>
                {analytics?.expense_by_category?.length ? (
                  <div className="ft-category-chart">{analytics.expense_by_category.map((item) => <div className="ft-category-item" key={item.category}><div className="ft-category-heading"><span>{item.category}</span><strong>{formatMoney(item.amount)}</strong></div><div className="ft-category-track"><div className="ft-category-bar" style={{ width: `${(item.amount / maxCategory) * 100}%` }} /></div><span className="ft-category-share">{analytics.expenses > 0 ? `${Math.round((item.amount / analytics.expenses) * 100)}% всех расходов` : ""}</span></div>)}</div>
                ) : <div className="ft-chart-empty"><span className="ft-empty-icon"><Icon name="chart" size={22} /></span><strong>Нет данных по категориям</strong><p>Добавь расходы, чтобы увидеть распределение.</p></div>}
              </section>
              <p className="ft-footnote">Общий баланс учитывает все операции. Месячная аналитика включает только операции с известной датой.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
