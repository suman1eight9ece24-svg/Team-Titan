# Habitflow — Build consistency, one day at a time

A calm, responsive habit tracker built with **HTML, CSS and vanilla JavaScript** for the Hack Day Haldia × GRID community challenge.

Habitflow makes progress visible through daily check-ins, streaks, weekly targets, activity heatmaps and simple insights. It works without an account or backend: your habits are saved in your browser.

## Features

### Habit management
- Create, edit, archive, restore and permanently delete habits.
- Organise habits by category, emoji and colour.
- Set a weekly target from 1 to 7 days.
- Search habits and filter by category.
- Start quickly with suggested habit templates.

### Daily tracking
- Check off a habit for today or backfill a previous date.
- Undo a check-in without losing other history.
- Select a past date from the dashboard calendar.
- See current and longest consecutive-day streaks for every habit.
- View today's progress and weekly target progress at a glance.

### Progress and insights
- GitHub-style **12-week (84-day) heatmap** for each habit and for all active habits.
- Weekly and monthly activity charts.
- Completion totals, category breakdown and milestone prompts.
- A shareable progress card exported as PNG.

### Reminders
- Set a reminder time and days for each habit.
- Opt in to browser notifications from Settings.
- Reminders are checked while the Habitflow page is open. The browser must support notifications and permission must be granted.
- Leave the reminder days unselected to repeat on every day.

### Data and installability
- Automatic saving in browser `localStorage`.
- Export and import a JSON backup.
- Responsive layout for desktop, tablet and mobile.
- Light and dark themes.
- Installable Progressive Web App (PWA) with an offline app shell using a service worker.

## Screens

- **Overview:** today's check-in list, key metrics, this-week progress and overall heatmap.
- **My habits:** searchable habit cards, individual streaks and heatmaps, archive and restore.
- **Insights:** weekly/monthly chart, category activity, milestones and overall heatmap.
- **Settings:** profile greeting, browser reminders, appearance, backup/restore and PNG export.

## Tech stack

| Technology | Purpose |
|---|---|
| HTML5 | Semantic page structure and dialogs |
| CSS3 | Responsive layout, themes and UI components |
| Vanilla JavaScript | State, habit logic, rendering and interactions |
| localStorage | Persistent, device-local data |
| Canvas API | Draw activity chart and export PNG card |
| Notification API | Optional browser reminders |
| Service Worker + Web App Manifest | Offline app shell and PWA installability |

No framework, database, API key or build step is required.

## Run locally

You need Node.js and npm for the local server.

```bash
npm start
```

Open the local URL printed by the server (usually `http://localhost:3000`).

You can also open `index.html` directly in a browser for basic tracking. For service-worker offline support, installability and browser notifications, use **localhost or HTTPS** instead of a `file://` URL.

## Deploy

This is a static website. Deploy the repository root to GitHub Pages, Netlify, Vercel or another static host. No build command is needed.

For GitHub Pages, select the branch and root folder in the repository's Pages settings. Service workers and PWA features require HTTPS; GitHub Pages provides HTTPS.

## Data and privacy

- Habit data is stored in the current browser under the key `hackday-haldia-team-titan`.
- No sign-in, analytics, tracking server or cloud sync is included.
- Clearing browser site data can erase saved habits. Use **Settings → Your data → Export data** to keep a backup.
- Importing a backup replaces the habits currently stored in that browser.
- Browser reminders are local notifications while the app is open. This version does not run a server or background push service, so it cannot guarantee reminders after the app/browser is closed.

## Suggested manual test checklist

- [ ] Create a habit with a category, weekly target, colour and emoji.
- [ ] Edit the habit and confirm its settings are updated.
- [ ] Complete today's habit, undo it, then complete it again.
- [ ] Choose a previous date and add a backfilled check-in.
- [ ] Confirm the current streak and longest streak update.
- [ ] Confirm the 12-week heatmap changes after a check-in.
- [ ] Search habits and filter by category.
- [ ] Archive a habit, restore it, then permanently delete a test habit.
- [ ] Switch between weekly and monthly insights.
- [ ] Refresh the page and confirm data is still present.
- [ ] Export a backup, import it and confirm the data is restored.
- [ ] Switch light/dark themes and test a narrow mobile viewport.
- [ ] On localhost/HTTPS, allow notifications and test a reminder time.
- [ ] On localhost/HTTPS, install the PWA, then check that the app shell opens offline after its first load.

## Suggested team split

For a team of 3–4, split ownership but integrate frequently:

1. **UI and accessibility:** layout, responsive styles, dialogs, colour and keyboard flow.
2. **Habit logic:** create/edit/archive, check-ins, date handling and streak calculations.
3. **Insights and visuals:** heatmaps, weekly/monthly chart and PNG share card.
4. **Integration and delivery:** reminders, backup/restore, PWA, testing and deployment.

Agree on the shared habit data shape before parallel work. Keep changes on feature branches and review them through Pull Requests.

## Project structure

```text
Team-Titan/
├── index.html       # App shell, navigation and dialogs
├── styles.css       # Responsive design system and themes
├── script.js        # State, habit logic, rendering and browser APIs
├── manifest.json    # PWA metadata
├── sw.js            # Offline app-shell caching
├── icon.svg         # App icon
├── package.json     # npm start script
└── README.md        # Project guide
```

## Hackathon submission checklist

- [ ] Core habit tracking features work end to end.
- [ ] Test the app on desktop and mobile.
- [ ] Deploy the project and verify the live link.
- [ ] Create a Pull Request on the assigned Voyage GitHub repository.
- [ ] Submit the project through the MLH platform (OrganizerHQ), following the event instructions.

## Challenge notes

- Teams of 3–4; every member must be present.
- Build on top of the starter project and integrate the new features.
- AI tools and open-source/open-weight models are allowed.

---

**Habitflow — small steps, real progress.**
