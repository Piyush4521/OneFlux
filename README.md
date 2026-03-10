# OneFlux

OneFlux is an IoT power-monitoring project with:

- a web dashboard (`OneFlux/`) built with React + Vite + Firebase
- ESP32 device firmware (`firmware/`) for telemetry, relay control, and safety trips

## Repository Structure

- `OneFlux/` - frontend application
- `firmware/` - ESP32 firmware and hardware setup notes

## Quick Start

### Web App

```bash
cd OneFlux
npm ci
npm run dev
```

### Firmware

1. Open `firmware/oneflux_esp32/oneflux_esp32.ino`.
2. Configure Wi-Fi and Firebase values.
3. Flash to ESP32 and monitor at `115200` baud.

See [firmware/README.md](firmware/README.md) for wiring and runtime behavior.

## Professional Defaults Included

- root-level Git repository for both app and firmware
- clean ignore rules for build artifacts, dependencies, and local debug files
- `main` as default branch
