# OneFlux

OneFlux is an IoT energy monitoring and safety-automation project that combines:

- a live web dashboard (`OneFlux/`) for telemetry visualization and remote relay control
- ESP32 firmware (`firmware/`) for sensing, local safety trips, and Firebase sync

## Monorepo Layout

```text
.
|-- OneFlux/                 # React + Vite dashboard
|   |-- src/
|   |-- package.json
|   `-- README.md
|-- firmware/
|   |-- oneflux_esp32/
|   |   `-- oneflux_esp32.ino
|   `-- README.md
|-- ABOUT.md                 # Project narrative and presentation summary
`-- README.md
```

## Core Features

### Dashboard

- live telemetry cards: voltage, current, power, frequency, energy, cost, CO2
- realtime charting with smoothed and raw power traces
- relay command workflow with desired-vs-actual state verification
- safety alert feed (cloud alerts + dashboard-derived warnings)
- theory and project explanation tabs for demos/presentations

### Firmware (ESP32)

- PZEM004T v3 sampling with EMA smoothing
- local fault checks: undervoltage, overvoltage, overcurrent, overpower
- autonomous relay trip on sustained fault (`FAULT_HOLD_MS`)
- periodic Firebase RTDB telemetry publishing
- command polling + manual override button support

## Architecture (High-Level)

1. ESP32 reads power metrics from PZEM.
2. Firmware applies safety logic and relay state updates locally.
3. Firmware publishes `/devices/socket1/live` and fault alerts to RTDB.
4. Dashboard subscribes to `/devices/socket1` for live updates.
5. Dashboard writes relay commands under `/devices/socket1/control`.

## Quick Start

## 1) Dashboard Setup

```bash
cd OneFlux
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5173`.

## 2) Firmware Setup

1. Open `firmware/oneflux_esp32/oneflux_esp32.ino`.
2. Set Wi-Fi and database macros.
3. Flash to ESP32 and open serial monitor at `115200`.

Detailed hardware/software steps: [firmware/README.md](firmware/README.md)

## Environment Variables (Dashboard)

Create `OneFlux/.env` from `.env.example`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Safety Notes

- The relay and mains load path involve high-voltage AC. Use proper isolation and enclosure.
- Keep local trip logic enabled on firmware even if cloud/dashboard is offline.
- Validate thresholds (`V_MIN`, `V_MAX`, `I_MAX`, `P_MAX`) for your hardware and region.

## Additional Docs

- Dashboard details: [OneFlux/README.md](OneFlux/README.md)
- Firmware details: [firmware/README.md](firmware/README.md)
- Project summary: [ABOUT.md](ABOUT.md)
