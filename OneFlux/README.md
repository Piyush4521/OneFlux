# OneFlux Dashboard

Frontend dashboard for OneFlux IoT energy monitoring.

## Stack

- React 19 + Vite
- Firebase Realtime Database
- Recharts (live trend visualization)
- Lucide React (icons)

## Features

- live telemetry panel from `/devices/socket1/live`
- live command-and-control for relay state
- derived + cloud alert feed
- theory/formula tab for project demo explanation
- dedicated About tab for project context and architecture

## Getting Started

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Environment Variables

Set the following in `.env`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run preview` - preview built app
- `npm run lint` - run eslint

## Realtime Data Contract

Dashboard listens at `/devices/socket1` and expects:

- `live.voltage`, `live.current`, `live.power`, `live.energy`, `live.frequency`
- `live.sampleTs`, `live.seq`, `live.wifiRssi`
- `live.relayDesired`, `live.relayActual`
- `live.tripActive`, `live.faultCode`, `live.status`
- `alerts/*` entries for alert history feed

Dashboard writes control commands to:

- `/devices/socket1/control/relayDesired`
- `/devices/socket1/control/updatedTs`
- `/devices/socket1/control/source`

## Production Notes

- Avoid hardcoding credentials in source code; use `.env`.
- Keep Firebase rules strict for write paths.
- Use HTTPS hosting (Firebase Hosting, Vercel, or Netlify).
