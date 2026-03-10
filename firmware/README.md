# OneFlux ESP32 Firmware

Firmware for ESP32 + PZEM004T v3 energy metering with safety relay control.

## Hardware Wiring

- `PZEM004T v3 TX/RX` -> ESP32 `RX2/TX2` on pins `16/17`
- Relay module input -> ESP32 `GPIO25`
- Manual override button -> ESP32 `GPIO26` to GND (`INPUT_PULLUP`)
- Status LED -> ESP32 `GPIO2`

## Prerequisites

- Arduino IDE with ESP32 board package installed
- Libraries:
  - `PZEM004Tv30`
  - `WiFi` (built-in)
  - `HTTPClient` (built-in)

## Configure Firmware

Edit `firmware/oneflux_esp32/oneflux_esp32.ino`:

- `WIFI_SSID`
- `WIFI_PASSWORD`
- `DATABASE_URL`
- `DATABASE_SECRET` (RTDB auth token)

## Flash Instructions

1. Select board: `ESP32 Dev Module` (or your ESP32 variant)
2. Set serial monitor baud to `115200`
3. Upload `firmware/oneflux_esp32/oneflux_esp32.ino`
4. Open serial monitor and confirm Wi-Fi + snapshot messages

## Firebase Paths

- Telemetry write: `/devices/socket1/live`
- Command read: `/devices/socket1/control/relayDesired`
- Alerts write: `/devices/socket1/alerts/*`

## Runtime Behavior

- Sensor sample every `250 ms` (`SENSOR_INTERVAL_MS`)
- Command poll every `800 ms` (`COMMAND_POLL_INTERVAL_MS`)
- Telemetry publish every `1000 ms` (`PUBLISH_INTERVAL_MS`)
- Wi-Fi reconnect retries every `8000 ms`
- Local trip on sustained fault after `FAULT_HOLD_MS` (`600 ms`)

## Safety Thresholds (Default)

- Voltage min: `200 V`
- Voltage max: `250 V`
- Current max: `10 A`
- Power max: `2200 W`

Update these constants for your electrical environment and load profile.

## Troubleshooting

- `sensor_disconnected`: check PZEM wiring and UART pins `16/17`
- Snapshot send failed: verify Wi-Fi and Firebase token validity
- Relay not switching: confirm relay wiring, `GPIO25`, and module logic level
