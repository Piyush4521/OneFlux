# OneFlux ESP32 Firmware

## 1. Wire the hardware
- `PZEM004T v3 TX/RX` -> ESP32 `RX2/TX2` on pins `16/17`
- Relay input -> ESP32 `GPIO25`
- Manual override button -> ESP32 `GPIO26` to GND (internal pull-up enabled)
- Status LED uses `GPIO2`

## 2. Configure credentials
- Open `firmware/oneflux_esp32.ino`
- Set `WIFI_SSID` and `WIFI_PASSWORD`
- Set `DATABASE_URL`
- Set `DATABASE_SECRET` to a valid RTDB auth token

## 3. Flash
- Board: ESP32
- Serial monitor baud: `115200`
- Upload `firmware/oneflux_esp32.ino`

## 4. Firebase paths used
- Telemetry write: `/devices/socket1/live`
- Command read: `/devices/socket1/control/relayDesired`
- Alert events: `/devices/socket1/alerts/*`

## 5. Device behavior
- Reads sensor every `250 ms`
- Runs local safety checks (voltage/current/power) continuously
- Polls relay command every `800 ms`
- Publishes one telemetry payload every `1000 ms`
- Trips relay locally on sustained fault (`FAULT_HOLD_MS`)
