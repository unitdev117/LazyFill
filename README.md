# LazyFill

LazyFill is a Chrome extension that helps users fill forms faster with AI. Instead of typing the same details again and again, the user creates a profile once, opens a form, and lets LazyFill scan the page, understand the fields, and suggest or fill the right values.

The project combines a browser extension frontend with a backend service. The extension handles scanning, field detection, previews, and filling inside the browser. The backend handles authentication, syncing, and storage for signed-in users.

## What the project does

LazyFill is built to reduce repetitive form filling. It looks at the visible text fields on a page, compares them with the user’s saved profile data, and then either:

- shows inline suggestions before filling, or
- fills the form automatically after scanning, depending on the selected mode.

It is designed for regular web forms, dynamic single-page apps, and pages that render fields late.

## Main features

### Profiles

Profiles are the core of LazyFill. A profile is a named collection of field labels and values such as:

- First Name
- Last Name
- Email
- Phone
- Address

Users can create multiple profiles, edit them, delete them, and choose which one is active. The active profile is the one LazyFill uses when it scans a form.

### Complete Auto Fill

This is the main action in the popup. When the user clicks it, LazyFill scans the current page, checks the detected fields, asks the AI to map the right profile values to those fields, and then fills them.

If matching suggestions already exist, it can commit them immediately without repeating the full process.

### Ghost Preview

Ghost Preview is the suggestion mode. Instead of filling the form immediately, LazyFill shows inline ghost text on matching fields. This helps the user review what will be filled before committing anything.

This is useful when the user wants more control and wants to see suggestions before they become actual input values.

### Auto-fill Mode

Auto-fill Mode is the direct mode. When it is turned on, LazyFill fills supported fields right after the scan instead of waiting for a separate confirmation step.

This mode is meant for faster completion when the user is confident in the saved profile data.

### Toggle behavior

Ghost Preview and Auto-fill Mode are mutually exclusive.

- If Ghost Preview is on, Auto-fill Mode stays off.
- If Auto-fill Mode is on, Ghost Preview stays off.

This keeps the experience predictable. The extension either suggests values or fills them, but it does not try to do both at the same time.

### Active tab stats

The dashboard shows how many fields were found on the current page and how many are currently fillable. This gives a quick idea of whether the extension has recognized the form properly.

### API key management

LazyFill uses a Google AI API key for AI-based field matching. The user can save, update, hide, reveal, or delete the key from the settings area inside the extension.

### Authentication and sync

The project supports local usage and signed-in usage.

- In local mode, profiles and settings stay in the current browser.
- In signed-in mode, profiles, API key, and settings can be synced across sessions through the backend.

The backend also supports sign up, login, logout, password change, and pulling or pushing synced state.

## How it works

At a high level, LazyFill follows this flow:

1. The extension scans the current page for supported text-entry fields.
2. It filters out fields that are already filled or should not be touched.
3. It tries fast local matching using the active profile.
4. If needed, it asks the AI to match more complex fields.
5. It either shows ghost suggestions or fills the fields directly.
6. It stores useful mappings in cache so the same form can be handled faster next time.

The scanner also handles dynamic pages and keeps watching for newly rendered fields.

## Project structure

### Frontend

The frontend is the browser extension. It includes:

- popup UI for dashboard, profiles, and settings
- content scripts for scanning and filling form fields
- ghost preview overlays
- background service worker for orchestration

### Backend

The backend is a Fastify service connected to MongoDB. It handles:

- authentication
- password changes
- synced user state
- profile storage for signed-in users

## Running the project

### Frontend

Install dependencies in `frontend/` and build the extension:

```bash
npm install
npm run build
```

The built extension files are written to `frontend/dist/`.

### Backend

Install dependencies in `backend/` and start the API server:

```bash
npm install
npm run dev
```

The backend runs on port mentioned in .env file.

## Environment requirements

The backend expects a `.env` file with at least:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

You can also provide `MONGO_DB_NAME` and `PORT` if needed.

## In short

LazyFill is a form-filling assistant that tries to make repetitive web forms less painful. It gives the user a simple way to save personal data, scan a page, preview likely matches, and fill forms with less manual work.
