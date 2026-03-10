#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <PZEM004Tv30.h>
#include <time.h>

#define WIFI_SSID "YOUR_WIFI"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define DATABASE_URL "https://oneflux-41cbc-default-rtdb.firebaseio.com"
#define DATABASE_SECRET "YOUR_RTDP_AUTH_TOKEN"

PZEM004Tv30 pzem(Serial2, 16, 17);

const int LED_PIN = 2;
const int RELAY_PIN = 25; 
const int MANUAL_BUTTON_PIN = 26;

const uint32_t SENSOR_INTERVAL_MS = 250;
const uint32_t PUBLISH_INTERVAL_MS = 1000;
const uint32_t COMMAND_POLL_INTERVAL_MS = 800;
const uint32_t WIFI_RETRY_INTERVAL_MS = 8000;
const uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
const uint16_t HTTP_TIMEOUT_MS = 2200;
const uint32_t BUTTON_DEBOUNCE_MS = 250;

const float EMA_ALPHA = 0.35f;

const float V_MIN = 200.0f;
const float V_MAX = 250.0f;
const float I_MAX = 10.0f;
const float P_MAX = 2200.0f;
const uint32_t FAULT_HOLD_MS = 600;

struct Telemetry {
  float voltage = 0.0f;
  float current = 0.0f;
  float power = 0.0f;
  float energy = 0.0f;
  float frequency = 0.0f;
};

Telemetry liveData;

bool hasValidSensor = false;
bool relayDesired = false;
bool relayActual = false;
bool tripActive = false;

String faultCode = "none";
uint32_t faultSinceTs = 0;
uint32_t sampleSeq = 0;
uint32_t faultStartMs = 0;

unsigned long lastSensorMs = 0;
unsigned long lastPublishMs = 0;
unsigned long lastCommandPollMs = 0;
unsigned long lastWiFiRetryMs = 0;
unsigned long lastButtonToggleMs = 0;

uint32_t epochNow() {
  time_t now = time(nullptr);
  return (now > 1700000000) ? static_cast<uint32_t>(now) : 0;
}

void updateStatusLed() {
  digitalWrite(LED_PIN, WiFi.status() == WL_CONNECTED ? HIGH : LOW);
}

void connectWiFi(bool waitForConnection) {
  if (WiFi.status() == WL_CONNECTED) {
    updateStatusLed();
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiRetryMs = millis();

  if (!waitForConnection) {
    Serial.println("WiFi reconnect started...");
    return;
  }

  Serial.print("Connecting to WiFi");
  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connect timeout, retrying in loop.");
  }

  updateStatusLed();
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    updateStatusLed();
    return;
  }

  if (millis() - lastWiFiRetryMs >= WIFI_RETRY_INTERVAL_MS) {
    connectWiFi(false);
  }

  updateStatusLed();
}

void syncClock() {
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
}

bool putJson(const String &url, const String &jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, url)) return false;

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.PUT(jsonBody);
  http.end();
  return (httpCode >= 200 && httpCode < 300);
}

void applyRelay(bool on, const char *reason) {
  relayActual = on;
  digitalWrite(RELAY_PIN, relayActual ? HIGH : LOW);
  Serial.print("Relay -> ");
  Serial.print(relayActual ? "ON" : "OFF");
  Serial.print(" (");
  Serial.print(reason);
  Serial.println(")");
}

void sendAlert(const char *severity, const String &code, float value, float threshold, const char *message) {
  uint32_t nowTs = epochNow();
  String key = "a_" + String(nowTs ? nowTs : millis()) + "_" + String(sampleSeq);
  String url = String(DATABASE_URL) + "/devices/socket1/alerts/" + key + ".json?auth=" + DATABASE_SECRET;

  String body = "{";
  body += "\"severity\":\"" + String(severity) + "\",";
  body += "\"code\":\"" + code + "\",";
  body += "\"value\":" + String(value, 3) + ",";
  body += "\"threshold\":" + String(threshold, 3) + ",";
  body += "\"message\":\"" + String(message) + "\",";
  body += "\"ts\":" + String(nowTs);
  body += "}";

  putJson(url, body);
}

String detectFaultCode() {
  if (!hasValidSensor) return "sensor_disconnected";
  if (liveData.voltage < V_MIN) return "undervoltage";
  if (liveData.voltage > V_MAX) return "overvoltage";
  if (liveData.current > I_MAX) return "overcurrent";
  if (liveData.power > P_MAX) return "overpower";
  return "none";
}

float faultValueForCode(const String &code) {
  if (code == "undervoltage" || code == "overvoltage") return liveData.voltage;
  if (code == "overcurrent") return liveData.current;
  if (code == "overpower") return liveData.power;
  return 0.0f;
}

float faultThresholdForCode(const String &code) {
  if (code == "undervoltage") return V_MIN;
  if (code == "overvoltage") return V_MAX;
  if (code == "overcurrent") return I_MAX;
  if (code == "overpower") return P_MAX;
  return 0.0f;
}

void updateSafety() {
  String activeFault = detectFaultCode();
  if (activeFault == "none") {
    faultStartMs = 0;
    if (tripActive) {
      tripActive = false;
      sendAlert("info", "recovered", 0.0f, 0.0f, "Fault cleared");
      faultCode = "none";
      faultSinceTs = 0;
    }
    return;
  }

  if (faultStartMs == 0) {
    faultStartMs = millis();
  }

  if (!tripActive && (millis() - faultStartMs >= FAULT_HOLD_MS)) {
    tripActive = true;
    faultCode = activeFault;
    faultSinceTs = epochNow();
    relayDesired = false;
    applyRelay(false, "safety_trip");
    sendAlert(
      "critical",
      activeFault,
      faultValueForCode(activeFault),
      faultThresholdForCode(activeFault),
      "Safety trip triggered"
    );
  }
}

void pollRelayCommand() {
  if (WiFi.status() != WL_CONNECTED) return;

  String url = String(DATABASE_URL) + "/devices/socket1/control/relayDesired.json?auth=" + DATABASE_SECRET;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, url)) return;

  http.setTimeout(HTTP_TIMEOUT_MS);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String body = http.getString();
    body.trim();
    if (body == "true") {
      relayDesired = true;
    } else if (body == "false") {
      relayDesired = false;
    }
  }

  http.end();
}

void readSensor() {
  float v = pzem.voltage();
  float c = pzem.current();
  float p = pzem.power();
  float e = pzem.energy();
  float f = pzem.frequency();

  if (isnan(v) || isnan(c) || isnan(p) || isnan(e) || isnan(f)) {
    hasValidSensor = false;
    return;
  }

  v = max(v, 0.0f);
  c = max(c, 0.0f);
  p = max(p, 0.0f);
  e = max(e, 0.0f);
  f = max(f, 0.0f);

  if (!hasValidSensor) {
    liveData.voltage = v;
    liveData.current = c;
    liveData.power = p;
    liveData.energy = e;
    liveData.frequency = f;
  } else {
    liveData.voltage = liveData.voltage + EMA_ALPHA * (v - liveData.voltage);
    liveData.current = liveData.current + EMA_ALPHA * (c - liveData.current);
    liveData.power = liveData.power + EMA_ALPHA * (p - liveData.power);
    liveData.energy = e;
    liveData.frequency = liveData.frequency + EMA_ALPHA * (f - liveData.frequency);
  }

  hasValidSensor = true;
  sampleSeq++;
}

void publishLiveSnapshot() {
  String status = "sensor_active";
  if (!hasValidSensor) status = "sensor_disconnected";
  if (tripActive) status = "trip_active";

  uint32_t nowTs = epochNow();

  String body = "{";
  body += "\"voltage\":" + String(liveData.voltage, 2) + ",";
  body += "\"current\":" + String(liveData.current, 3) + ",";
  body += "\"power\":" + String(liveData.power, 2) + ",";
  body += "\"energy\":" + String(liveData.energy, 4) + ",";
  body += "\"frequency\":" + String(liveData.frequency, 2) + ",";
  body += "\"status\":\"" + status + "\",";
  body += "\"sampleTs\":" + String(nowTs) + ",";
  body += "\"uptimeMs\":" + String(millis()) + ",";
  body += "\"seq\":" + String(sampleSeq) + ",";
  body += "\"wifiRssi\":" + String(WiFi.RSSI()) + ",";
  body += "\"relayDesired\":" + String(relayDesired ? "true" : "false") + ",";
  body += "\"relayActual\":" + String(relayActual ? "true" : "false") + ",";
  body += "\"tripActive\":" + String(tripActive ? "true" : "false") + ",";
  body += "\"faultCode\":\"" + faultCode + "\",";
  body += "\"faultSinceTs\":" + String(faultSinceTs);
  body += "}";

  String url = String(DATABASE_URL) + "/devices/socket1/live.json?auth=" + DATABASE_SECRET;
  bool ok = putJson(url, body);
  Serial.println(ok ? "Snapshot sent" : "Snapshot send failed");
}

void handleManualButton() {
  if (digitalRead(MANUAL_BUTTON_PIN) != LOW) return;
  if (millis() - lastButtonToggleMs < BUTTON_DEBOUNCE_MS) return;

  lastButtonToggleMs = millis();
  if (tripActive) {
    Serial.println("Manual toggle ignored while tripActive");
    return;
  }

  relayDesired = !relayDesired;
  Serial.print("Manual relayDesired -> ");
  Serial.println(relayDesired ? "ON" : "OFF");
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, 16, 17);

  pinMode(LED_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(MANUAL_BUTTON_PIN, INPUT_PULLUP);

  digitalWrite(LED_PIN, LOW);
  digitalWrite(RELAY_PIN, LOW);

  Serial.println("\n--- OneFlux ESP32 Starting ---");
  connectWiFi(true);
  syncClock();
}

void loop() {
  ensureWiFi();

  const unsigned long nowMs = millis();

  if (nowMs - lastSensorMs >= SENSOR_INTERVAL_MS) {
    lastSensorMs = nowMs;
    readSensor();
    updateSafety();
  }

  if (nowMs - lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollMs = nowMs;
    pollRelayCommand();
  }

  handleManualButton();

  bool relayTarget = tripActive ? false : relayDesired;
  if (relayTarget != relayActual) {
    applyRelay(relayTarget, "target_change");
  }

  if (nowMs - lastPublishMs >= PUBLISH_INTERVAL_MS) {
    lastPublishMs = nowMs;
    publishLiveSnapshot();
  }
}
