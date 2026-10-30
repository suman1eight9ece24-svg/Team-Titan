/* Habitflow — private, local-first habit tracker. No framework or external runtime dependencies. */
(() => {
  "use strict";

  const STORAGE_KEY = "hackday-haldia-team-titan";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const todayISO = () => toISO(new Date());
  const COLORS = ["green", "blue", "purple", "orange", "pink", "teal"];
  const CATEGORY_NAMES = ["Learning", "Health", "Mindfulness", "Productivity", "Personal", "Other"];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let currentView = "dashboard";
  let chartMode = "weekly";
  let toastTimer = null;
  let pendingConfirm = null;
  let installPrompt = null;
  const sentReminders = new Set();

  const freshState = () => ({
    habits: [],
    settings: { theme: "light", displayName: "", remindersEnabled: false, selectedDate: todayISO() }
  });

  let state = freshState();

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function fromISO(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function addDays(value, amount) {
    const date = typeof value === "string" ? fromISO(value) : new Date(value);
    date.setDate(date.getDate() + amount);
    return toISO(date);
  }

  function startOfWeek(value) {
    const date = fromISO(value);
    const weekday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - weekday);
    return toISO(date);
  }

  function formatDate(value, options = { month: "short", day: "numeric" }) {
    if (!value) return "";
    return fromISO(value).toLocaleDateString(undefined, options);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function makeId() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `habit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeHabit(habit) {
    const completedDates = Array.isArray(habit.completedDates) ? habit.completedDates : [];
    return {
      id: String(habit.id || makeId()),
      name: String(habit.name || "Untitled habit").slice(0, 48),
      category: CATEGORY_NAMES.includes(habit.category) ? habit.category : "Other",
      emoji: String(habit.emoji || "🌱"),
      color: COLORS.includes(habit.color) ? habit.color : "green",
      targetDays: Math.min(7, Math.max(1, Number(habit.targetDays) || 5)),
      reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(habit.reminderTime || "") ? habit.reminderTime : "",
      reminderDays: Array.isArray(habit.reminderDays) ? habit.reminderDays.map(Number).filter((d) => d >= 0 && d <= 6) : [],
      archived: Boolean(habit.archived),
      createdAt: habit.createdAt || new Date().toISOString(),
      completedDates: [...new Set(completedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
    };
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw || typeof raw !== "object") return;
      if (Array.isArray(raw.habits)) {
        state.habits = raw.habits.map(normalizeHabit);
      } else if (Array.isArray(raw.items)) {
        // Migrate the original starter shape if an earlier version saved anything.
        state.habits = raw.items.map((item) => normalizeHabit({
          ...item,
          name: item.name || item.title || item.text,
          completedDates: item.completedDates || []
        }));
      }
      state.settings = {
        ...freshState().settings,
        ...(raw.settings && typeof raw.settings === "object" ? raw.settings : {})
      };
      if (state.settings.selectedDate > todayISO() || !/^\d{4}-\d{2}-\d{2}$/.test(state.settings.selectedDate || "")) {
        state.settings.selectedDate = todayISO();
      }
      if (!["light", "dark"].includes(state.settings.theme)) state.settings.theme = "light";
    } catch (error) {
      console.warn("Habitflow could not read its saved data.", error);
      state = freshState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Habitflow could not save to localStorage.", error);
      toast("This browser could not save your changes. Export a backup before leaving.", "error");
      return false;
    }
  }

  function activeHabits() {
    return state.habits.filter((habit) => !habit.archived);
  }

  function archivedHabits() {
    return state.habits.filter((habit) => habit.archived);
  }

  function hasCheckin(habit, date) {
    return habit.completedDates.includes(date);
  }

  function completedCount(date, habits = activeHabits()) {
    return habits.filter((habit) => hasCheckin(habit, date)).length;
  }

  function getStreaks(habit) {
    const dates = [...new Set(habit.completedDates)].sort();
    let longest = 0;
    let run = 0;
    let previous = null;
    for (const date of dates) {
      run = previous && addDays(previous, 1) === date ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = date;
    }
    const today = todayISO();
    const start = hasCheckin(habit, today) ? today : addDays(today, -1);
    let current = 0;
    let cursor = start;
    const dateSet = new Set(dates);
    while (dateSet.has(cursor)) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
    return { current, longest };
  }

  function weekMetrics(habits = activeHabits(), weekStart = startOfWeek(todayISO())) {
    let done = 0;
    let target = 0;
    const today = todayISO();
    for (const habit of habits) {
      target += habit.targetDays;
      for (let i = 0; i < 7; i += 1) {
        const date = addDays(weekStart, i);
        if (date <= today && hasCheckin(habit, date)) done += 1;
      }
    }
    return { done, target, percent: target ? Math.min(100, Math.round((done / target) * 100)) : 0 };
  }

  function totalCheckins(habits = activeHabits()) {
    return habits.reduce((sum, habit) => sum + habit.completedDates.filter((date) => date <= todayISO()).length, 0);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme;
    const themeButton = $("#themeToggle");
    if (themeButton) {
      themeButton.textContent = state.settings.theme === "dark" ? "☼" : "◐";
      themeButton.title = state.settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    }
  }

  function toast(message, type = "success") {
    const node = $("#toast");
    if (!node) return;
    node.textContent = message;
    node.className = `toast show${type === "error" ? " error" : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2700);
  }

  function setPageMeta(title, subtitle, eyebrow = "YOUR PERSONAL HABIT SPACE") {
    const labels = { dashboard: "Overview", habits: "My habits", insights: "Insights", settings: "Settings" };
    $("#breadcrumbCurrent").textContent = labels[currentView] || "Overview";
    $("#pageEyebrow").textContent = eyebrow;
    $("#pageTitle").innerHTML = title;
    $("#pageSubtitle").textContent = subtitle;
  }

  function render() {
    applyTheme();
    $("#topbarDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    $("#habitNavCount").textContent = activeHabits().length;
    $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === currentView));
    const root = $("#viewRoot");
    if (currentView === "dashboard") root.innerHTML = renderDashboard();
    else if (currentView === "habits") root.innerHTML = renderHabitsPage();
    else if (currentView === "insights") root.innerHTML = renderInsights();
    else root.innerHTML = renderSettings();
    if (currentView === "insights") drawTrendChart();
  }

  function renderDashboard() {
    const habits = activeHabits();
    const selectedDate = state.settings.selectedDate || todayISO();
    const doneToday = completedCount(todayISO(), habits);
    const doneSelected = completedCount(selectedDate, habits);
    const progress = habits.length ? Math.round((doneToday / habits.length) * 100) : 0;
    const week = weekMetrics(habits);
    const streakCount = habits.filter((habit) => getStreaks(habit).current > 0).length;
    const greeting = state.settings.displayName ? `Welcome back, ${escapeHTML(state.settings.displayName)}.` : "A fresh page, a fresh start.";
    const selectedLabel = selectedDate === todayISO() ? "today" : formatDate(selectedDate, { weekday: "long", month: "short", day: "numeric" });
    const todayList = habits.length ? `
      <div class="habit-list">
        ${habits.map((habit) => {
          const done = hasCheckin(habit, selectedDate);
          const streak = getStreaks(habit).current;
          return `<div class="habit-row">
            <div class="habit-emoji colour-${habit.color}">${escapeHTML(habit.emoji)}</div>
            <div class="habit-info">
              <span class="habit-name">${escapeHTML(habit.name)}</span>
              <span class="habit-meta"><span>${escapeHTML(habit.category)}</span><span class="meta-sep">•</span><span>${habit.targetDays}× / week</span>${streak ? `<span class="meta-sep">•</span><span>🔥 ${streak} day streak</span>` : ""}</span>
            </div>
            <button class="check-button ${done ? "is-done" : ""}" data-action="checkin" data-id="${escapeHTML(habit.id)}" data-date="${selectedDate}" aria-label="${done ? "Undo" : "Complete"} ${escapeHTML(habit.name)} for ${selectedLabel}" ${selectedDate > todayISO() ? "disabled" : ""}>${done ? "✓" : "✓"}</button>
          </div>`;
        }).join("")}
      </div>` : renderEmptyState("Your first habit starts here", "Add one small thing you want to do more often. You can build the rest as you go.", true);

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(todayISO()), i));
    const miniWeek = weekDays.map((date) => {
      const count = completedCount(date, habits);
      const done = count > 0;
      return `<div class="weekday-mini"><div class="weekday-name">${DAY_NAMES[fromISO(date).getDay()]}</div><div class="weekday-dot ${done ? "has-checkin" : ""} ${date === todayISO() ? "is-today" : ""}" title="${formatDate(date, { month: "short", day: "numeric" })}: ${count} check-ins">${fromISO(date).getDate()}</div></div>`;
    }).join("");

    return `
      <div class="dashboard-grid">
        <div class="dashboard-main">
          <section class="welcome-card">
            <p class="welcome-kicker">YOUR PROGRESS, AT A GLANCE</p>
            <h2 class="welcome-title">${greeting}</h2>
            <p class="welcome-copy">${habits.length ? "You don't have to do everything. Just take the next small step." : "Start with one simple habit and make it yours."}</p>
            <div class="welcome-progress"><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span class="progress-caption">${doneToday} of ${habits.length} done today</span></div>
          </section>

          <section class="stat-grid" aria-label="Your habit summary">
            <article class="stat-card"><div class="stat-top"><span class="stat-label">Today's progress</span><span class="stat-icon">✓</span></div><div class="stat-value">${progress}%</div><div class="stat-note">${doneToday} / ${habits.length} habits completed</div></article>
            <article class="stat-card"><div class="stat-top"><span class="stat-label">Active habits</span><span class="stat-icon">◎</span></div><div class="stat-value">${habits.length}</div><div class="stat-note">${archivedHabits().length} archived</div></article>
            <article class="stat-card"><div class="stat-top"><span class="stat-label">Weekly progress</span><span class="stat-icon">↗</span></div><div class="stat-value">${week.percent}%</div><div class="stat-note">${week.done} of ${week.target} target check-ins</div></article>
            <article class="stat-card"><div class="stat-top"><span class="stat-label">Active streaks</span><span class="stat-icon">✳</span></div><div class="stat-value">${streakCount}</div><div class="stat-note">Habits with a current streak</div></article>
          </section>

          <section class="panel">
            <div class="panel-header">
              <div><h2 class="panel-title">Your daily check-in</h2><p class="panel-subtitle">${doneSelected} of ${habits.length} habits completed for this date</p></div>
              <label class="date-control">Date <input type="date" id="selectedDate" value="${selectedDate}" max="${todayISO()}" aria-label="Choose a check-in date"></label>
            </div>
            ${todayList}
          </section>

          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">Your consistency map</h2><p class="panel-subtitle">The last 12 weeks, one day at a time</p></div><button class="text-link" data-view="insights">View insights →</button></div>
            ${renderHeatmap(null)}
            <div class="heatmap-foot"><span>${totalCheckins(habits)} total check-ins so far</span><span>Each square = one day</span></div>
          </section>
        </div>

        <aside class="dashboard-side">
          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">This week</h2><p class="panel-subtitle">A little progress each day</p></div><span class="stat-icon">▦</span></div>
            <div class="weekly-mini">${miniWeek}</div>
            <div class="card-progress-line"><span>Weekly target</span><strong>${week.done} / ${week.target}</strong></div>
            <div class="thin-progress"><span style="width:${week.percent}%"></span></div>
          </section>

          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">Keep your rhythm</h2><p class="panel-subtitle">Your current momentum</p></div></div>
            <div class="side-streak"><div class="streak-symbol">🔥</div><div><div class="streak-number">${streakCount}</div><div class="streak-label">active habit streaks</div></div></div>
            <p class="muted-copy" style="margin:13px 0 0">${streakCount ? "Nice work. Protect the small routines that are working for you." : "A streak begins with one completed day. Start whenever you're ready."}</p>
          </section>

          <section class="panel">
            <div class="panel-header"><div><h2 class="panel-title">A gentle reminder</h2><p class="panel-subtitle">Make your routine easier to remember</p></div></div>
            <p class="muted-copy" style="margin:0 0 12px">Set a time and days for a habit. Browser reminders work while this app is open.</p>
            <button class="button button-quiet button-small" data-view="settings">Set up reminders →</button>
          </section>
        </aside>
      </div>`;
  }

  function renderEmptyState(title, copy, withTemplates = false) {
    return `<div class="empty-state"><div class="empty-illustration">✳</div><h3 class="empty-title">${escapeHTML(title)}</h3><p class="empty-copy">${escapeHTML(copy)}</p>
      ${withTemplates ? `<div class="settings-actions" style="justify-content:center"><button class="button button-primary button-small" data-action="template" data-template="Read 20 minutes">＋ Reading</button><button class="button button-quiet button-small" data-action="template" data-template="Move your body">＋ Movement</button><button class="button button-quiet button-small" data-action="template" data-template="Learn something new">＋ Learning</button></div>` : ""}
    </div>`;
  }

  function renderHeatmap(habit = null) {
    const start = addDays(startOfWeek(todayISO()), -77);
    const dates = Array.from({ length: 84 }, (_, index) => addDays(start, index));
    const habits = habit ? [habit] : activeHabits();
    const monthLabels = Array.from({ length: 12 }, (_, index) => {
      const date = dates[index * 7];
      const currentMonth = fromISO(date).getMonth();
      const previousMonth = index ? fromISO(dates[(index - 1) * 7]).getMonth() : -1;
      return (index === 0 || currentMonth !== previousMonth) ? formatDate(date, { month: "short" }) : "";
    });
    const weeks = Array.from({ length: 12 }, (_, weekIndex) => {
      const days = dates.slice(weekIndex * 7, weekIndex * 7 + 7);
      return `<div class="heatmap-week">${days.map((date) => {
        const count = date > todayISO() ? 0 : completedCount(date, habits);
        const total = habits.length;
        const ratio = total ? count / total : 0;
        const level = count === 0 ? 0 : ratio <= .25 ? 1 : ratio <= .5 ? 2 : ratio <= .75 ? 3 : 4;
        const title = `${formatDate(date, { weekday: "short", month: "short", day: "numeric" })}: ${count} of ${total} habits`;
        return `<span class="heat-cell level-${level} ${date > todayISO() ? "future" : ""}" title="${escapeHTML(title)}" aria-label="${escapeHTML(title)}"></span>`;
      }).join("")}</div>`;
    }).join("");
    return `<div class="heatmap-wrap"><div class="heatmap-months">${monthLabels.map((month) => `<span>${month}</span>`).join("")}</div><div class="heatmap-grid" role="img" aria-label="Twelve week consistency heatmap">${weeks}</div></div><div class="heat-legend"><span>Less</span><i class="heat-cell"></i><i class="heat-cell level-1"></i><i class="heat-cell level-2"></i><i class="heat-cell level-3"></i><i class="heat-cell level-4"></i><span>More</span></div>`;
  }

  function renderHabitsPage() {
    const showingArchived = Boolean(state.settings.showArchived);
    const habits = showingArchived ? archivedHabits() : activeHabits();
    const cards = habits.map((habit) => {
      const streak = getStreaks(habit);
      const currentWeek = weekMetrics([habit]);
      return `<article class="habit-card colour-${habit.color}" data-habit-card data-name="${escapeHTML(habit.name.toLowerCase())}" data-category="${escapeHTML(habit.category)}">
        <div class="habit-card-top">
          <div class="habit-emoji">${escapeHTML(habit.emoji)}</div>
          <div class="habit-card-title"><h3>${escapeHTML(habit.name)}</h3><span class="category-label"><i class="habit-color-dot"></i>${escapeHTML(habit.category)} · ${habit.targetDays} days / week</span></div>
          ${!showingArchived ? `<button class="more-button" data-action="edit" data-id="${escapeHTML(habit.id)}" aria-label="Edit ${escapeHTML(habit.name)}">···</button>` : ""}
        </div>
        <div class="card-progress-line"><span>This week's target</span><strong>${currentWeek.done} / ${habit.targetDays} completed</strong></div>
        <div class="thin-progress"><span style="width:${Math.min(100, Math.round((currentWeek.done / habit.targetDays) * 100))}%"></span></div>
        <div class="card-heatmap">${renderHeatmap(habit)}</div>
        <div class="card-footer"><div class="card-streaks"><span>🔥 <strong>${streak.current}</strong> current</span><span>✦ <strong>${streak.longest}</strong> best</span></div>
          <div class="card-actions">${showingArchived ? `<button class="mini-action" data-action="restore" data-id="${escapeHTML(habit.id)}">Restore</button><button class="mini-action muted" data-action="delete" data-id="${escapeHTML(habit.id)}">Delete</button>` : `<button class="mini-action muted" data-action="archive" data-id="${escapeHTML(habit.id)}">Archive</button>`}</div>
        </div>
      </article>`;
    }).join("");

    return `
      <div class="toolbar">
        <label class="search-wrap"><span>⌕</span><input class="search-input" id="habitSearch" type="search" placeholder="Search your habits..." aria-label="Search habits"></label>
        <select class="filter-select" id="habitCategoryFilter" aria-label="Filter by category"><option value="">All categories</option>${CATEGORY_NAMES.map((name) => `<option>${name}</option>`).join("")}</select>
        <button class="button button-quiet button-small" data-action="toggle-archived">${showingArchived ? "← Active habits" : `Archived (${archivedHabits().length})`}</button>
      </div>
      ${showingArchived ? '<div class="archived-banner">Archived habits are paused. Restore one to continue tracking it.</div>' : ""}
      <div class="habits-grid" id="habitsGrid">${cards || renderEmptyState(showingArchived ? "No archived habits" : "No habits yet", showingArchived ? "Habits you archive will appear here." : "Create your first habit or start with one of these simple ideas.", !showingArchived)}</div>`;
  }

  function periodData(mode) {
    const habits = activeHabits();
    if (mode === "monthly") {
      return Array.from({ length: 6 }, (_, index) => {
        const now = new Date();
        const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1, 12);
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const start = toISO(new Date(year, month, 1, 12));
        const end = toISO(new Date(year, month + 1, 0, 12));
        let count = 0;
        habits.forEach((habit) => { count += habit.completedDates.filter((date) => date >= start && date <= end && date <= todayISO()).length; });
        return { label: monthDate.toLocaleDateString(undefined, { month: "short" }), value: count };
      });
    }
    return Array.from({ length: 8 }, (_, index) => {
      const firstWeek = addDays(startOfWeek(todayISO()), -49);
      const weekStart = addDays(firstWeek, index * 7);
      let count = 0;
      habits.forEach((habit) => { count += habit.completedDates.filter((date) => date >= weekStart && date < addDays(weekStart, 7) && date <= todayISO()).length; });
      const date = fromISO(weekStart);
      return { label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: count };
    });
  }

  function renderInsights() {
    const habits = activeHabits();
    const checkins = totalCheckins(habits);
    const week = weekMetrics(habits);
    const bestStreak = habits.reduce((max, habit) => Math.max(max, getStreaks(habit).longest), 0);
    const categories = CATEGORY_NAMES.map((category) => {
      const group = habits.filter((habit) => habit.category === category);
      return { category, count: group.reduce((sum, habit) => sum + habit.completedDates.length, 0) };
    }).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
    const maxCategory = Math.max(1, ...categories.map((item) => item.count));
    const milestones = [
      { icon: "🌱", title: "First step", copy: "Log your first check-in", achieved: checkins >= 1 },
      { icon: "🔥", title: "A week of effort", copy: "Reach a 7-day streak", achieved: bestStreak >= 7 },
      { icon: "🌿", title: "Growing steadily", copy: "Log 25 check-ins", achieved: checkins >= 25 },
      { icon: "🏆", title: "Consistency champion", copy: "Reach a 30-day streak", achieved: bestStreak >= 30 }
    ];
    return `
      <div class="insight-stat-grid">
        <article class="insight-stat"><span>Total check-ins</span><strong>${checkins}</strong></article>
        <article class="insight-stat"><span>This week's progress</span><strong>${week.percent}%</strong></article>
        <article class="insight-stat"><span>Longest streak</span><strong>${bestStreak} days</strong></article>
      </div>
      <section class="panel chart-panel">
        <div class="panel-header"><div><h2 class="panel-title">Your activity over time</h2><p class="panel-subtitle">Completed habit check-ins in each period</p></div><div class="chart-controls"><button class="chart-tab ${chartMode === "weekly" ? "active" : ""}" data-action="chart-mode" data-mode="weekly">Weekly</button><button class="chart-tab ${chartMode === "monthly" ? "active" : ""}" data-action="chart-mode" data-mode="monthly">Monthly</button></div></div>
        <div class="chart-canvas-wrap"><canvas id="trendChart" role="img" aria-label="${chartMode} habit completion chart"></canvas></div>
      </section>
      <div class="insights-lower">
        <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Where your energy goes</h2><p class="panel-subtitle">Check-ins by habit category</p></div></div>
          ${categories.length ? `<div class="category-rows">${categories.map((item) => `<div class="category-row"><span>${escapeHTML(item.category)}</span><div class="thin-progress"><span style="width:${Math.round(item.count / maxCategory * 100)}%"></span></div><strong>${item.count}</strong></div>`).join("")}</div>` : '<p class="muted-copy">Your category insights will appear after your first check-in.</p>'}
        </section>
        <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Milestones</h2><p class="panel-subtitle">Small wins worth celebrating</p></div></div>
          <div class="milestone-list">${milestones.map((item) => `<div class="milestone"><div class="milestone-icon">${item.icon}</div><div><strong>${escapeHTML(item.title)} ${item.achieved ? "✓" : ""}</strong><span>${escapeHTML(item.copy)}</span></div></div>`).join("")}</div>
        </section>
      </div>
      <section class="panel" style="margin-top:17px"><div class="panel-header"><div><h2 class="panel-title">Overall consistency map</h2><p class="panel-subtitle">Your last 12 weeks across all active habits</p></div></div>${renderHeatmap(null)}</section>`;
  }

  function renderSettings() {
    const name = escapeHTML(state.settings.displayName || "");
    const hasReminder = activeHabits().some((habit) => habit.reminderTime);
    return `
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings sections"><button class="active" data-action="settings-scroll" data-target="profileSettings">Profile</button><button data-action="settings-scroll" data-target="reminderSettings">Reminders</button><button data-action="settings-scroll" data-target="appearanceSettings">Appearance</button><button data-action="settings-scroll" data-target="dataSettings">Your data</button></nav>
        <div class="settings-content">
          <section class="settings-section" id="profileSettings"><h3>Your profile</h3><p>A small personal touch for your habit space.</p>
            <div class="setting-row"><div><div class="setting-name">Display name</div><div class="setting-help">Used in your dashboard greeting. This stays on your device.</div></div><input class="text-input setting-inline-input" id="displayNameInput" maxlength="28" placeholder="Your name" value="${name}"></div>
          </section>
          <section class="settings-section" id="reminderSettings"><h3>Reminders</h3><p>Gentle nudges to help you remember. Notifications are sent only while this page is open.</p>
            <div class="setting-row"><div><div class="setting-name">Enable browser reminders</div><div class="setting-help">Allow Habitflow to show notifications for the time and days you set on each habit.</div></div><label class="toggle"><input type="checkbox" id="remindersToggle" ${state.settings.remindersEnabled ? "checked" : ""}><span></span></label></div>
            <div class="setting-row"><div><div class="setting-name">Notification permission</div><div class="setting-help" id="notificationPermission">${typeof Notification === "undefined" ? "Notifications are not supported by this browser." : `Current status: ${Notification.permission}`}</div></div><button class="button button-quiet button-small" id="notificationPermissionButton" type="button">Allow notifications</button></div>
            <div class="settings-callout">${hasReminder ? "Some habits have reminder times set." : "Tip: add a reminder time and days when creating or editing a habit."} Browser notifications require permission and a secure context (HTTPS or localhost).</div>
          </section>
          <section class="settings-section" id="appearanceSettings"><h3>Appearance</h3><p>Choose the look that feels comfortable.</p>
            <div class="setting-row"><div><div class="setting-name">Dark theme</div><div class="setting-help">Switch between a soft light palette and a low-light palette.</div></div><label class="toggle"><input type="checkbox" id="darkThemeToggle" ${state.settings.theme === "dark" ? "checked" : ""}><span></span></label></div>
          </section>
          <section class="settings-section" id="dataSettings"><h3>Your data & privacy</h3><p>Your habits are stored in this browser using localStorage. Nothing is sent to a server.</p>
            <div class="setting-row"><div><div class="setting-name">Backup and restore</div><div class="setting-help">Export your habits as a JSON file or restore them on this device later.</div></div><div class="settings-actions"><button class="button button-quiet button-small" data-action="export">Export data</button><button class="button button-quiet button-small" data-action="import">Import data</button></div></div>
            <div class="setting-row"><div><div class="setting-name">Share your progress</div><div class="setting-help">Create a PNG summary card with your totals and consistency.</div></div><button class="button button-quiet button-small" data-action="share">Create PNG</button></div>
            <div class="setting-row"><div><div class="setting-name">Install Habitflow</div><div class="setting-help">Add the app to your device for an app-like experience and offline access.</div></div><button class="button button-quiet button-small" id="installButton" data-action="install">Install app</button></div>
            <div class="settings-callout"><strong>${state.habits.length} habits</strong> · <strong>${totalCheckins(state.habits)} check-ins</strong> saved on this device. Clearing browser site data will remove this information, so keep a backup.</div>
          </section>
        </div>
      </div>`;
  }

  function drawTrendChart() {
    const canvas = $("#trendChart");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    const styles = getComputedStyle(document.documentElement);
    const muted = styles.getPropertyValue("--muted").trim() || "#86938a";
    const grid = styles.getPropertyValue("--line").trim() || "#e6ebe6";
    const green = styles.getPropertyValue("--green-2").trim() || "#367956";
    const data = periodData(chartMode);
    const max = Math.max(4, ...data.map((item) => item.value));
    const left = 34, right = 12, top = 14, bottom = 34;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    ctx.font = "10px DM Sans, sans-serif";
    ctx.textBaseline = "middle";
    for (let line = 0; line <= 4; line += 1) {
      const y = top + plotHeight - (plotHeight / 4) * line;
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
      ctx.fillStyle = muted;
      ctx.textAlign = "right";
      ctx.fillText(String(Math.round(max * line / 4)), left - 8, y);
    }
    const slot = plotWidth / data.length;
    const barWidth = Math.min(chartMode === "weekly" ? 27 : 36, slot * .52);
    data.forEach((item, index) => {
      const x = left + slot * index + (slot - barWidth) / 2;
      const barHeight = item.value ? Math.max(3, (item.value / max) * plotHeight) : 2;
      const y = top + plotHeight - barHeight;
      ctx.fillStyle = green;
      roundRect(ctx, x, y, barWidth, barHeight, 5);
      ctx.fill();
      ctx.fillStyle = muted;
      ctx.textAlign = "center";
      ctx.fillText(item.label, x + barWidth / 2, height - 13);
      if (item.value > 0) {
        ctx.fillStyle = styles.getPropertyValue("--ink-2").trim() || "#44564b";
        ctx.fillText(String(item.value), x + barWidth / 2, Math.max(top + 7, y - 9));
      }
    });
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  }

  function openHabitDialog(habit = null, defaults = {}) {
    const dialog = $("#habitDialog");
    $("#habitDialogTitle").textContent = habit ? "Edit habit" : "Create a habit";
    $("#habitId").value = habit ? habit.id : "";
    $("#habitName").value = habit ? habit.name : (defaults.name || "");
    $("#habitCategory").value = habit ? habit.category : (defaults.category || "Learning");
    $("#habitEmoji").value = habit ? habit.emoji : (defaults.emoji || "📚");
    $("#habitTarget").value = String(habit ? habit.targetDays : 5);
    $("#habitColor").value = habit ? habit.color : (defaults.color || "green");
    $("#habitReminderTime").value = habit ? habit.reminderTime : "";
    const days = habit ? habit.reminderDays : [];
    $$("#reminderDays input").forEach((input) => { input.checked = days.includes(Number(input.value)); });
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    setTimeout(() => $("#habitName").focus(), 30);
  }

  function closeDialog(dialog) {
    if (dialog && typeof dialog.close === "function") dialog.close();
    else if (dialog) dialog.removeAttribute("open");
  }

  function saveHabitFromForm(event) {
    event.preventDefault();
    const id = $("#habitId").value;
    const name = $("#habitName").value.trim();
    if (!name) { $("#habitName").focus(); return; }
    const existing = state.habits.find((habit) => habit.id === id);
    const reminderDays = $$("#reminderDays input:checked").map((input) => Number(input.value));
    const next = normalizeHabit({
      ...(existing || {}),
      id: existing ? existing.id : makeId(),
      name,
      category: $("#habitCategory").value,
      emoji: $("#habitEmoji").value,
      targetDays: Number($("#habitTarget").value),
      color: $("#habitColor").value,
      reminderTime: $("#habitReminderTime").value,
      reminderDays,
      archived: existing ? existing.archived : false,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      completedDates: existing ? existing.completedDates : []
    });
    if (existing) {
      state.habits = state.habits.map((habit) => habit.id === id ? next : habit);
      toast("Habit updated.");
    } else {
      state.habits.unshift(next);
      toast("Your new habit is ready.");
    }
    saveState();
    closeDialog($("#habitDialog"));
    currentView = "habits";
    render();
  }

  function toggleCheckin(id, date) {
    if (date > todayISO()) return;
    const habit = state.habits.find((item) => item.id === id && !item.archived);
    if (!habit) return;
    if (hasCheckin(habit, date)) {
      habit.completedDates = habit.completedDates.filter((item) => item !== date);
      toast("Check-in removed.");
    } else {
      habit.completedDates.push(date);
      habit.completedDates.sort();
      toast(date === todayISO() ? "Nice work. Check-in complete!" : "Past check-in added.");
    }
    saveState();
    render();
  }

  function askConfirm({ title, copy, actionLabel, action }) {
    pendingConfirm = action;
    $("#confirmTitle").textContent = title;
    $("#confirmCopy").textContent = copy;
    $("#confirmAction").textContent = actionLabel;
    const dialog = $("#confirmDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function archiveHabit(id) {
    const habit = state.habits.find((item) => item.id === id);
    if (!habit) return;
    habit.archived = true;
    saveState();
    closeDialog($("#confirmDialog"));
    toast("Habit archived. You can restore it any time.");
    render();
  }

  function restoreHabit(id) {
    const habit = state.habits.find((item) => item.id === id);
    if (!habit) return;
    habit.archived = false;
    saveState();
    toast("Habit restored.");
    render();
  }

  function deleteHabit(id) {
    const habit = state.habits.find((item) => item.id === id);
    if (!habit) return;
    askConfirm({
      title: "Delete this habit permanently?",
      copy: `“${habit.name}” and its check-in history will be removed from this device. Export a backup first if you may need it.`,
      actionLabel: "Delete permanently",
      action: () => {
        state.habits = state.habits.filter((item) => item.id !== id);
        saveState();
        closeDialog($("#confirmDialog"));
        toast("Habit deleted.");
        render();
      }
    });
  }

  function exportData() {
    const payload = {
      app: "Habitflow",
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      habits: state.habits,
      settings: state.settings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `habitflow-backup-${todayISO()}.json`);
    toast("Your backup is ready.");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.habits)) throw new Error("This file does not look like a Habitflow backup.");
        if (!window.confirm(`Import ${parsed.habits.length} habits? This will replace the habits currently saved in this browser.`)) return;
        state.habits = parsed.habits.map(normalizeHabit);
        if (parsed.settings && typeof parsed.settings === "object") {
          state.settings = { ...state.settings, ...parsed.settings };
        }
        saveState();
        toast("Backup restored successfully.");
        currentView = "dashboard";
        render();
      } catch (error) {
        toast(error.message || "Could not read that backup file.", "error");
      } finally {
        $("#importFile").value = "";
      }
    };
    reader.onerror = () => toast("Could not read that file.", "error");
    reader.readAsText(file);
  }

  function shareProgress() {
    const habits = activeHabits();
    const done = totalCheckins(habits);
    const week = weekMetrics(habits);
    const best = habits.reduce((max, habit) => Math.max(max, getStreaks(habit).longest), 0);
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext("2d");
    if (!ctx) { toast("Your browser cannot create the progress card.", "error"); return; }
    ctx.fillStyle = "#f2f6f1"; ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "#18382a"; roundRect(ctx, 48, 48, 1104, 534, 30); ctx.fill();
    ctx.fillStyle = "#d8edc9"; ctx.font = "700 24px DM Sans, sans-serif"; ctx.fillText("HABITFLOW  /  MY PROGRESS", 100, 125);
    ctx.fillStyle = "#ffffff"; ctx.font = "800 62px Manrope, sans-serif"; ctx.fillText("Small steps. Real progress.", 100, 225);
    ctx.fillStyle = "#c9dbc9"; ctx.font = "28px DM Sans, sans-serif"; ctx.fillText(`${done} check-ins logged across ${habits.length} active habits`, 100, 282);
    const stats = [{ value: `${week.percent}%`, label: "THIS WEEK" }, { value: String(best), label: "BEST STREAK (DAYS)" }, { value: String(habits.length), label: "ACTIVE HABITS" }];
    stats.forEach((stat, index) => {
      const x = 100 + index * 330;
      ctx.fillStyle = "#2b5b40"; roundRect(ctx, x, 355, 285, 135, 18); ctx.fill();
      ctx.fillStyle = "#d9efcb"; ctx.font = "800 47px Manrope, sans-serif"; ctx.fillText(stat.value, x + 25, 418);
      ctx.fillStyle = "#c1d7c3"; ctx.font = "700 15px DM Sans, sans-serif"; ctx.fillText(stat.label, x + 25, 458);
    });
    ctx.fillStyle = "#a9c5a9"; ctx.font = "20px DM Sans, sans-serif"; ctx.fillText(`Updated ${formatDate(todayISO(), { month: "long", day: "numeric", year: "numeric" })}`, 100, 535);
    canvas.toBlob((blob) => {
      if (blob) { downloadBlob(blob, `habitflow-progress-${todayISO()}.png`); toast("Your progress card is ready to share."); }
      else toast("Could not create the PNG card.", "error");
    }, "image/png");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) { toast("This browser does not support notifications.", "error"); return; }
    try {
      const permission = await Notification.requestPermission();
      const label = $("#notificationPermission");
      if (label) label.textContent = `Current status: ${permission}`;
      if (permission === "granted") {
        state.settings.remindersEnabled = true;
        saveState();
        toast("Browser reminders enabled.");
      } else {
        state.settings.remindersEnabled = false;
        saveState();
        toast("Notification permission was not granted.", "error");
      }
      render();
    } catch (error) {
      toast("Could not request notification permission.", "error");
    }
  }

  function checkReminders() {
    if (!state.settings.remindersEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const weekday = now.getDay();
    const date = todayISO();
    activeHabits().forEach((habit) => {
      if (!habit.reminderTime || habit.reminderTime !== time) return;
      if (habit.reminderDays.length && !habit.reminderDays.includes(weekday)) return;
      if (hasCheckin(habit, date)) return;
      const token = `${habit.id}:${date}:${time}`;
      if (sentReminders.has(token)) return;
      sentReminders.add(token);
      try {
        const notification = new Notification(`Time for ${habit.name}`, {
          body: "A small step today keeps your routine moving.",
          icon: "icon.svg",
          tag: token
        });
        notification.onclick = () => { window.focus(); currentView = "dashboard"; render(); notification.close(); };
      } catch (error) {
        console.warn("Could not show a reminder notification.", error);
      }
    });
  }

  function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choice) => {
        if (choice.outcome === "accepted") toast("Habitflow is being installed.");
        installPrompt = null;
      });
    } else {
      toast("Use your browser menu and choose “Install app” or “Add to Home Screen”.");
    }
  }

  function handleClick(event) {
    if (event.target.closest("#notificationPermissionButton")) { enableNotifications(); return; }

    const viewButton = event.target.closest("[data-view], [data-view-link]");
    if (viewButton) {
      event.preventDefault();
      currentView = viewButton.dataset.view || viewButton.dataset.viewLink || "dashboard";
      if (!["dashboard", "habits", "insights", "settings"].includes(currentView)) currentView = "dashboard";
      state.settings.showArchived = false;
      render();
      return;
    }

    const closeButton = event.target.closest("[data-close-dialog]");
    if (closeButton) { closeDialog(closeButton.closest("dialog")); return; }

    const checkButton = event.target.closest('[data-action="checkin"]');
    if (checkButton) { toggleCheckin(checkButton.dataset.id, checkButton.dataset.date); return; }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const { action, id } = actionButton.dataset;

    if (action === "edit") {
      const habit = state.habits.find((item) => item.id === id);
      if (habit) openHabitDialog(habit);
    } else if (action === "archive") {
      const habit = state.habits.find((item) => item.id === id);
      if (habit) askConfirm({ title: "Archive this habit?", copy: `“${habit.name}” will be hidden from your active list. Your check-in history stays safe, and you can restore it later.`, actionLabel: "Archive habit", action: () => archiveHabit(id) });
    } else if (action === "restore") {
      restoreHabit(id);
    } else if (action === "delete") {
      deleteHabit(id);
    } else if (action === "toggle-archived") {
      state.settings.showArchived = !state.settings.showArchived;
      render();
    } else if (action === "template") {
      const template = actionButton.dataset.template;
      const options = template === "Move your body"
        ? { name: template, category: "Health", emoji: "🏃", color: "orange" }
        : template === "Learn something new"
          ? { name: template, category: "Learning", emoji: "💻", color: "blue" }
          : { name: template, category: "Learning", emoji: "📚", color: "green" };
      openHabitDialog(null, options);
    } else if (action === "chart-mode") {
      chartMode = actionButton.dataset.mode;
      render();
    } else if (action === "export") {
      exportData();
    } else if (action === "import") {
      $("#importFile").click();
    } else if (action === "share") {
      shareProgress();
    } else if (action === "install") {
      handleInstall();
    } else if (action === "settings-scroll") {
      const target = document.getElementById(actionButton.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      $$(".settings-nav button").forEach((button) => button.classList.toggle("active", button === actionButton));
    }
  }

  function handleInput(event) {
    if (event.target.id === "selectedDate") {
      const chosen = event.target.value;
      if (chosen && chosen <= todayISO()) {
        state.settings.selectedDate = chosen;
        saveState();
        render();
      }
    } else if (event.target.id === "habitSearch") {
      const query = event.target.value.trim().toLowerCase();
      $$("[data-habit-card]").forEach((card) => {
        const category = $("#habitCategoryFilter")?.value || "";
        const matchesName = card.dataset.name.includes(query);
        const matchesCategory = !category || card.dataset.category === category;
        card.classList.toggle("hidden", !(matchesName && matchesCategory));
      });
    } else if (event.target.id === "displayNameInput") {
      state.settings.displayName = event.target.value.trim();
      saveState();
      const title = $("#pageTitle");
      if (title && currentView === "dashboard") title.innerHTML = `Welcome back, ${escapeHTML(state.settings.displayName || "friend")}.`;
    }
  }

  function handleChange(event) {
    if (event.target.id === "habitCategoryFilter") {
      const category = event.target.value;
      const query = ($("#habitSearch")?.value || "").trim().toLowerCase();
      $$("[data-habit-card]").forEach((card) => {
        card.classList.toggle("hidden", !((!query || card.dataset.name.includes(query)) && (!category || card.dataset.category === category)));
      });
    } else if (event.target.id === "remindersToggle") {
      if (event.target.checked) enableNotifications();
      else { state.settings.remindersEnabled = false; saveState(); toast("Browser reminders paused."); }
    } else if (event.target.id === "darkThemeToggle") {
      state.settings.theme = event.target.checked ? "dark" : "light";
      saveState(); render();
    }
  }

  function handleSubmit(event) {
    if (event.target.id === "habitForm") saveHabitFromForm(event);
  }

  function initialize() {
    loadState();
    applyTheme();
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", handleSubmit);
    $("#newHabitButton").addEventListener("click", () => openHabitDialog());
    $("#themeToggle").addEventListener("click", () => {
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      saveState(); render();
    });
    $("#profileShortcut").addEventListener("click", () => { currentView = "settings"; render(); $("#displayNameInput")?.focus(); });
    $("#confirmAction").addEventListener("click", () => { if (pendingConfirm) { const action = pendingConfirm; pendingConfirm = null; action(); } });
    $("#importFile").addEventListener("change", (event) => importData(event.target.files?.[0]));
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      installPrompt = event;
      const button = $("#installButton");
      if (button) button.textContent = "Install now";
    });
    window.addEventListener("appinstalled", () => { installPrompt = null; toast("Habitflow installed successfully."); });
    window.addEventListener("resize", () => { if (currentView === "insights") drawTrendChart(); });
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Offline support could not be enabled.", error)));
    }
    render();
    setInterval(checkReminders, 30000);
    checkReminders();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();