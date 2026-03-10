import { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, onValue, ref, set } from "firebase/database";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  AlertTriangle,
  DollarSign,
  Gauge,
  Leaf,
  PlugZap,
  Power,
  Signal,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import "./App.css";

const firebaseConfig = {
  apiKey: "AIzaSyCoQUC1GnV9VKbTZ4bhC8PtisFCZGKgnPQ",
  authDomain: "oneflux-41cbc.firebaseapp.com",
  databaseURL: "https://oneflux-41cbc-default-rtdb.firebaseio.com",
  projectId: "oneflux-41cbc",
  storageBucket: "oneflux-41cbc.firebasestorage.app",
  messagingSenderId: "803427248746",
  appId: "1:803427248746:web:2bf0ed5b8336104a093813",
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const COST_PER_KWH = 6.5;
const CO2_PER_KWH = 0.82;
const MAX_GRAPH_POINTS = 80;
const STALE_DATA_TIMEOUT_MS = 10000;
const SMOOTHING_ALPHA = 0.25;

const V_MIN = 200;
const V_MAX = 250;
const I_MAX = 10;
const P_MAX = 2200;

const DEFAULT_DATA = {
  current: 0,
  energy: 0,
  faultCode: "none",
  faultSinceTs: 0,
  frequency: 0,
  power: 0,
  relayActual: false,
  relayDesired: false,
  sampleTs: 0,
  seq: 0,
  status: "connecting",
  tripActive: false,
  uptimeMs: 0,
  voltage: 0,
  wifiRssi: 0,
};

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalizeStatus(value) {
  if (typeof value !== "string") return "unknown";
  return value.trim().toLowerCase();
}

function normalizeFaultCode(value) {
  if (typeof value !== "string") return "none";
  return value.trim().toLowerCase();
}

function toEpochMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
}

function normalizeAlertFeed(rawAlerts) {
  if (!rawAlerts || typeof rawAlerts !== "object") return [];

  return Object.entries(rawAlerts)
    .map(([id, entry]) => {
      if (!entry || typeof entry !== "object") return null;
      return {
        code: normalizeFaultCode(entry.code),
        id,
        message: typeof entry.message === "string" ? entry.message : "Alert event",
        severity: typeof entry.severity === "string" ? entry.severity.toLowerCase() : "info",
        threshold: toFiniteNumber(entry.threshold),
        ts: toFiniteNumber(entry.ts),
        value: toFiniteNumber(entry.value),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8);
}

function normalizePayload(raw) {
  const live = raw && typeof raw.live === "object" ? raw.live : raw || {};
  return {
    current: toFiniteNumber(live.current),
    energy: toFiniteNumber(live.energy),
    faultCode: normalizeFaultCode(live.faultCode),
    faultSinceTs: toFiniteNumber(live.faultSinceTs),
    frequency: toFiniteNumber(live.frequency),
    power: toFiniteNumber(live.power),
    relayActual: toBoolean(live.relayActual),
    relayDesired: toBoolean(live.relayDesired),
    sampleTs: toFiniteNumber(live.sampleTs),
    seq: toFiniteNumber(live.seq),
    status: normalizeStatus(live.status),
    tripActive: toBoolean(live.tripActive),
    uptimeMs: toFiniteNumber(live.uptimeMs),
    voltage: toFiniteNumber(live.voltage),
    wifiRssi: toFiniteNumber(live.wifiRssi),
  };
}

function getDeviceLabel(power) {
  if (power === 0) return "Standby / No Load";
  if (power < 30) return "Phone Charger";
  if (power < 80) return "Laptop";
  if (power < 150) return "Monitor / TV";
  if (power < 350) return "Cooler";
  if (power < 1000) return "Refrigerator";
  return "Geyser / Heater";
}

function getLoadProfile(power) {
  if (power === 0) return "Idle load profile";
  if (power < 80) return "Light load profile";
  if (power < 350) return "Moderate load profile";
  if (power < 1000) return "Heavy load profile";
  return "High demand load profile";
}

function getVoltageCondition(voltage) {
  if (!voltage) return "Voltage reading pending";
  if (voltage < V_MIN) return "Undervoltage trend detected";
  if (voltage > V_MAX) return "Overvoltage trend detected";
  return "Voltage is within nominal range";
}

function getFrequencyCondition(frequency) {
  if (!frequency) return "Frequency reading pending";
  const drift = Math.abs(frequency - 50);
  if (drift <= 0.2) return "Grid frequency is very stable";
  if (drift <= 0.5) return "Grid frequency is acceptable";
  return "Grid frequency is fluctuating";
}

function buildDerivedAlerts(payload, isConnected, errorText) {
  const alerts = [];
  const nowTs = Math.floor(Date.now() / 1000);

  if (!isConnected && errorText) {
    alerts.push({
      code: "stream_error",
      id: `derived_stream_${nowTs}`,
      message: errorText,
      severity: "warning",
      threshold: 0,
      ts: nowTs,
      value: 0,
    });
  }

  if (payload.tripActive) {
    alerts.push({
      code: payload.faultCode || "trip_active",
      id: `derived_trip_${nowTs}`,
      message: `Safety trip active (${payload.faultCode || "unknown"})`,
      severity: "critical",
      threshold: 0,
      ts: nowTs,
      value: 0,
    });
  }

  if (payload.voltage && payload.voltage < V_MIN) {
    alerts.push({
      code: "undervoltage",
      id: `derived_uv_${nowTs}`,
      message: `Voltage low: ${payload.voltage.toFixed(1)} V`,
      severity: "warning",
      threshold: V_MIN,
      ts: nowTs,
      value: payload.voltage,
    });
  }

  if (payload.voltage && payload.voltage > V_MAX) {
    alerts.push({
      code: "overvoltage",
      id: `derived_ov_${nowTs}`,
      message: `Voltage high: ${payload.voltage.toFixed(1)} V`,
      severity: "warning",
      threshold: V_MAX,
      ts: nowTs,
      value: payload.voltage,
    });
  }

  if (payload.current && payload.current > I_MAX) {
    alerts.push({
      code: "overcurrent",
      id: `derived_oc_${nowTs}`,
      message: `Current high: ${payload.current.toFixed(2)} A`,
      severity: "warning",
      threshold: I_MAX,
      ts: nowTs,
      value: payload.current,
    });
  }

  if (payload.power && payload.power > P_MAX) {
    alerts.push({
      code: "overpower",
      id: `derived_op_${nowTs}`,
      message: `Power high: ${payload.power.toFixed(0)} W`,
      severity: "warning",
      threshold: P_MAX,
      ts: nowTs,
      value: payload.power,
    });
  }

  return alerts.slice(0, 6);
}

function getAlertClass(severity) {
  if (severity === "critical") return "is-critical";
  if (severity === "warning") return "is-warning";
  return "is-info";
}

export default function App() {
  const [data, setData] = useState(() => ({ ...DEFAULT_DATA }));
  const [graphData, setGraphData] = useState([]);
  const [connected, setConnected] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("Unknown");
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [streamError, setStreamError] = useState("");
  const [activeTab, setActiveTab] = useState("live");
  const [alerts, setAlerts] = useState([]);
  const [pendingRelayCommand, setPendingRelayCommand] = useState(false);
  const [commandError, setCommandError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const staleTimerRef = useRef(null);
  const lastPointKeyRef = useRef("");
  const latestDataRef = useRef({ ...DEFAULT_DATA });
  const pendingRelayRef = useRef(false);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    pendingRelayRef.current = pendingRelayCommand;
  }, [pendingRelayCommand]);

  useEffect(() => {
    const tickId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(tickId);
    };
  }, []);

  useEffect(() => {
    const resetStaleTimer = () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        setConnected(false);
      }, STALE_DATA_TIMEOUT_MS);
    };

    const socket1Ref = ref(database, "/devices/socket1");
    const unsubscribe = onValue(
      socket1Ref,
      (snapshot) => {
        const val = snapshot.val();

        if (!val) {
          setConnected(false);
          setStreamError("No telemetry yet at /devices/socket1");
          setData({ ...DEFAULT_DATA, status: "no_data" });
          setDeviceLabel("Unknown");
          setLastSeenAt(null);
          setAlerts([]);
          if (staleTimerRef.current) {
            clearTimeout(staleTimerRef.current);
            staleTimerRef.current = null;
          }
          return;
        }

        const normalized = normalizePayload(val);
        const now = Date.now();

        setData(normalized);
        setConnected(true);
        setStreamError("");
        setLastSeenAt(now);
        resetStaleTimer();

        if (pendingRelayRef.current && normalized.relayActual === normalized.relayDesired) {
          pendingRelayRef.current = false;
          setPendingRelayCommand(false);
        }

        const cloudAlerts = normalizeAlertFeed(val.alerts);
        const derivedAlerts = buildDerivedAlerts(normalized, true, "");
        setAlerts([...derivedAlerts, ...cloudAlerts].slice(0, 8));

        const hasSampleId = normalized.sampleTs > 0 || normalized.seq > 0;
        const pointKey = hasSampleId
          ? `${normalized.sampleTs}-${normalized.seq}`
          : `${now}-${normalized.power.toFixed(2)}-${normalized.current.toFixed(2)}`;
        if (pointKey !== lastPointKeyRef.current) {
          lastPointKeyRef.current = pointKey;
          setGraphData((previous) => {
            const previousSmooth = previous.length
              ? previous[previous.length - 1].smoothedPower
              : normalized.power;

            const smoothedPower = previousSmooth + SMOOTHING_ALPHA * (normalized.power - previousSmooth);

            const sampleTimeMs = toEpochMs(normalized.sampleTs);
            const pointTime = sampleTimeMs
              ? new Date(sampleTimeMs).toLocaleTimeString()
              : new Date(now).toLocaleTimeString();

            const nextPoint = {
              current: normalized.current,
              power: normalized.power,
              smoothedPower,
              time: pointTime,
              voltage: normalized.voltage,
            };

            return [...previous, nextPoint].slice(-MAX_GRAPH_POINTS);
          });
        }

        const nextLabel = getDeviceLabel(normalized.power);
        setDeviceLabel((previous) => (previous === nextLabel ? previous : nextLabel));
      },
      (error) => {
        setConnected(false);
        const nextError = error?.message || "Realtime listener error";
        setStreamError(nextError);
        setAlerts(buildDerivedAlerts(latestDataRef.current, false, nextError));
      },
    );

    return () => {
      unsubscribe();
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, []);

  const handleRelayToggle = async () => {
    const nextDesired = !data.relayDesired;
    setPendingRelayCommand(true);
    setCommandError("");

    try {
      await set(ref(database, "/devices/socket1/control/relayDesired"), nextDesired);
      await set(ref(database, "/devices/socket1/control/updatedTs"), Math.floor(Date.now() / 1000));
      await set(ref(database, "/devices/socket1/control/source"), "web_dashboard");
    } catch (error) {
      setPendingRelayCommand(false);
      setCommandError(error?.message || "Failed to send relay command");
    }
  };

  const voltage = data.voltage;
  const current = data.current;
  const power = data.power;
  const energy = data.energy;
  const frequency = data.frequency;

  const costTodayPaise = Math.round(energy * COST_PER_KWH * 100);
  const liveCostRatePaisePerHour = Math.round((power / 1000) * COST_PER_KWH * 100);
  const co2Today = (energy * CO2_PER_KWH).toFixed(3);

  const apparentPower = voltage * current;
  const estimatedPowerFactor = apparentPower > 5 ? Math.max(0, Math.min(power / apparentPower, 1)) : null;

  const sensorStatus = normalizeStatus(data.status);
  const sensorDisconnected = sensorStatus === "sensor_disconnected";
  const sensorTrip = sensorStatus === "trip_active" || data.tripActive;
  const sensorActive = sensorStatus === "sensor_active";
  const sensorStatusClass = sensorDisconnected
    ? "is-alert"
    : sensorTrip
      ? "is-warning"
      : sensorActive
        ? "is-ok"
        : "is-pending";

  const sensorStatusText = sensorDisconnected
    ? "Sensor disconnected"
    : sensorTrip
      ? `Trip active (${data.faultCode || "unknown"})`
      : sensorActive
        ? "Sensor active"
        : "Sensor status pending";

  const connectionLabel = connected ? "Live Stream" : streamError ? "Stream Issue" : "Reconnecting";
  const lastUpdateText = lastSeenAt ? new Date(lastSeenAt).toLocaleTimeString() : "No update yet";
  const sampleTimeMs = toEpochMs(data.sampleTs);
  const sampleTimeText = sampleTimeMs ? new Date(sampleTimeMs).toLocaleTimeString() : "No sample clock";
  const sampleLatencyMs = sampleTimeMs && nowMs ? Math.max(0, nowMs - sampleTimeMs) : null;
  const sampleLatencyText = sampleLatencyMs === null ? "--" : `${sampleLatencyMs} ms`;

  const energyPerHourKwh = power / 1000;
  const estimatedDailyEnergyKwh = energyPerHourKwh * 24;
  const estimatedDailyCostPaise = Math.round(estimatedDailyEnergyKwh * COST_PER_KWH * 100);
  const estimatedMonthlyCostPaise = estimatedDailyCostPaise * 30;

  const relayHealthClass = data.relayActual === data.relayDesired ? "is-synced" : "is-drift";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-glow dashboard-glow-one" />
      <div className="dashboard-glow dashboard-glow-two" />

      <main className="dashboard">
        <header className="dashboard-header">
          <div className="brand-block">
            <p className="brand-eyebrow">OneFlux Control Panel</p>
            <h1>Smart Energy Monitor</h1>
            <p className="brand-subtitle">Live telemetry, safety trips, and smart switch control from socket1.</p>
          </div>

          <div className="connection-meta">
            <div
              className={`connection-pill ${connected ? "is-online" : "is-offline"}`}
              title={streamError || undefined}
            >
              {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{connectionLabel}</span>
            </div>
            <div className="latency-pill">
              <Signal size={14} />
              <span>Latency: {sampleLatencyText}</span>
            </div>
          </div>
        </header>

        <section className="view-tabs" aria-label="App Sections">
          <button
            className={`tab-button ${activeTab === "live" ? "is-active" : ""}`}
            onClick={() => setActiveTab("live")}
            type="button"
          >
            Live Monitor
          </button>
          <button
            className={`tab-button ${activeTab === "theory" ? "is-active" : ""}`}
            onClick={() => setActiveTab("theory")}
            type="button"
          >
            Theory & Guide
          </button>
        </section>

        {activeTab === "live" ? (
          <>
            <section className="hero-grid">
              <article className="hero-card">
                <p className="section-label">Detected Device</p>
                <h2>{deviceLabel}</h2>
                <p className={`sensor-health ${sensorStatusClass}`}>{sensorStatusText}</p>

                <div className="hero-meta-grid">
                  <div>
                    <span>Energy Today (kWh)</span>
                    <strong>{energy.toFixed(3)} kWh</strong>
                  </div>
                  <div>
                    <span>Cost Today (paise)</span>
                    <strong>{costTodayPaise.toLocaleString("en-IN")} paise</strong>
                  </div>
                  <div>
                    <span>CO2 Impact (kg)</span>
                    <strong>{co2Today} kg</strong>
                  </div>
                  <div>
                    <span>Sample Time</span>
                    <strong>{sampleTimeText}</strong>
                  </div>
                  <div>
                    <span>Last UI Update</span>
                    <strong>{lastUpdateText}</strong>
                  </div>
                  <div>
                    <span>WiFi RSSI</span>
                    <strong>{data.wifiRssi.toFixed(0)} dBm</strong>
                  </div>
                </div>
              </article>

              <article className="live-summary-card">
                <p className="section-label">Live Snapshot</p>
                <div className="summary-row">
                  <span>Power Draw</span>
                  <strong>{power.toFixed(0)} W</strong>
                </div>
                <div className="summary-row">
                  <span>Line Voltage</span>
                  <strong>{voltage.toFixed(1)} V</strong>
                </div>
                <div className="summary-row">
                  <span>Current</span>
                  <strong>{current.toFixed(2)} A</strong>
                </div>
                <div className="summary-row">
                  <span>Apparent Power</span>
                  <strong>{apparentPower.toFixed(1)} VA</strong>
                </div>
                <div className="summary-row">
                  <span>Est. Power Factor</span>
                  <strong>{estimatedPowerFactor === null ? "--" : estimatedPowerFactor.toFixed(2)}</strong>
                </div>
                <div className="summary-row">
                  <span>Live Cost Rate</span>
                  <strong>{liveCostRatePaisePerHour.toLocaleString("en-IN")} paise/hr</strong>
                </div>
                <div className="summary-row">
                  <span>Frequency</span>
                  <strong>{frequency.toFixed(2)} Hz</strong>
                </div>
                <div className="summary-row">
                  <span>Fault</span>
                  <strong>{data.faultCode || "none"}</strong>
                </div>
              </article>
            </section>

            <section className="metrics-grid">
              <StatCard accent="gold" icon={<Zap size={18} />} label="Voltage (V)" value={`${voltage.toFixed(1)} V`} />
              <StatCard
                accent="green"
                icon={<Activity size={18} />}
                label="Current (A)"
                value={`${current.toFixed(2)} A`}
              />
              <StatCard accent="blue" icon={<PlugZap size={18} />} label="Power (W)" value={`${power.toFixed(0)} W`} />
              <StatCard
                accent="amber"
                icon={<DollarSign size={18} />}
                label="Cost Today (paise)"
                value={`${costTodayPaise.toLocaleString("en-IN")} paise`}
              />
              <StatCard accent="teal" icon={<Leaf size={18} />} label="CO2 Today (kg)" value={`${co2Today} kg`} />
              <StatCard
                accent="slate"
                icon={<Gauge size={18} />}
                label="Frequency (Hz)"
                value={`${frequency.toFixed(2)} Hz`}
              />
            </section>

            <section className="panel-grid">
              <article className="panel chart-panel">
                <div className="panel-header">
                  <h3>Power Timeline (W)</h3>
                  <span>Last {MAX_GRAPH_POINTS} device samples</span>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={graphData}>
                      <XAxis
                        dataKey="time"
                        minTickGap={22}
                        stroke="#738194"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                      />
                      <YAxis stroke="#738194" tick={{ fontSize: 11 }} tickLine={false} width={50} />
                      <Tooltip
                        contentStyle={{
                          background: "#ffffff",
                          border: "1px solid #d6e1eb",
                          borderRadius: "10px",
                          boxShadow: "0 8px 30px rgba(11, 26, 46, 0.12)",
                        }}
                        formatter={(value, name) => [`${Number(value).toFixed(0)} W`, name]}
                        labelStyle={{ color: "#2e3d4d", fontWeight: 600 }}
                      />
                      <Line
                        dataKey="power"
                        dot={false}
                        name="Raw Power"
                        stroke="#ff6f3c"
                        strokeWidth={2.2}
                        type="monotone"
                      />
                      <Line
                        dataKey="smoothedPower"
                        dot={false}
                        name="Smoothed Power"
                        stroke="#1f7aec"
                        strokeWidth={1.8}
                        type="monotone"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  {graphData.length === 0 && <p className="chart-empty">Waiting for live samples...</p>}
                </div>
              </article>

              <article className="panel insight-panel">
                <div className="panel-header">
                  <h3>Operational Insights</h3>
                  <Signal size={16} />
                </div>
                <ul className="insight-list">
                  <li>{getLoadProfile(power)}</li>
                  <li>{getVoltageCondition(voltage)}</li>
                  <li>{getFrequencyCondition(frequency)}</li>
                  <li>
                    {estimatedPowerFactor === null
                      ? "Power factor estimate pending"
                      : `Estimated power factor ${estimatedPowerFactor.toFixed(2)}`}
                  </li>
                  <li>Relay sync: {data.relayActual === data.relayDesired ? "Healthy" : "Awaiting command sync"}</li>
                </ul>
              </article>
            </section>

            <section className="control-grid">
              <article className="panel relay-panel">
                <div className="panel-header">
                  <h3>Smart Switch</h3>
                  <Power size={16} />
                </div>
                <p className="relay-copy">Send relay command from dashboard and verify actual state returned by ESP32.</p>

                <div className={`relay-health ${relayHealthClass}`}>
                  Desired: {data.relayDesired ? "ON" : "OFF"} | Actual: {data.relayActual ? "ON" : "OFF"}
                </div>

                <button
                  className={`relay-toggle ${data.relayDesired ? "is-on" : "is-off"}`}
                  onClick={handleRelayToggle}
                  type="button"
                  disabled={!connected || pendingRelayCommand}
                >
                  {pendingRelayCommand ? "Sending..." : data.relayDesired ? "Turn OFF" : "Turn ON"}
                </button>

                {commandError && <p className="command-error">{commandError}</p>}
              </article>

              <article className="panel alert-panel">
                <div className="panel-header">
                  <h3>Safety Notifications</h3>
                  <AlertTriangle size={16} />
                </div>
                <ul className="alert-feed">
                  {alerts.length === 0 ? (
                    <li className="alert-item is-info">No active alerts</li>
                  ) : (
                    alerts.map((alert) => (
                      <li key={alert.id} className={`alert-item ${getAlertClass(alert.severity)}`}>
                        <div className="alert-head">
                          <span className="alert-code">{alert.code}</span>
                          <span>{new Date(toEpochMs(alert.ts) || nowMs).toLocaleTimeString()}</span>
                        </div>
                        <p>{alert.message}</p>
                      </li>
                    ))
                  )}
                </ul>
              </article>
            </section>
          </>
        ) : (
          <section className="theory-page">
            <article className="panel">
              <div className="panel-header">
                <h3>Core Formula Sheet</h3>
                <span>Project theory reference</span>
              </div>
              <div className="formula-grid">
                <div className="formula-item">
                  <p>Real Power</p>
                  <code>P (W) = V x I x PF</code>
                </div>
                <div className="formula-item">
                  <p>Apparent Power</p>
                  <code>S (VA) = V x I</code>
                </div>
                <div className="formula-item">
                  <p>Power Factor</p>
                  <code>PF = P / S</code>
                </div>
                <div className="formula-item">
                  <p>Energy</p>
                  <code>E (kWh) = (P / 1000) x t(hours)</code>
                </div>
                <div className="formula-item">
                  <p>Live Cost in Paise</p>
                  <code>Cost = E(kWh) x Tariff(INR/kWh) x 100</code>
                </div>
                <div className="formula-item">
                  <p>CO2 Emission</p>
                  <code>CO2 (kg) = E(kWh) x 0.82</code>
                </div>
              </div>
            </article>

            <div className="theory-grid">
              <article className="panel">
                <div className="panel-header">
                  <h3>Live Worked Example</h3>
                  <span>Using current stream values</span>
                </div>
                <ul className="calc-list">
                  <li>
                    <span>Input values</span>
                    <strong>
                      V={voltage.toFixed(1)} V, I={current.toFixed(2)} A, P={power.toFixed(0)} W
                    </strong>
                  </li>
                  <li>
                    <span>Apparent power</span>
                    <strong>{apparentPower.toFixed(1)} VA</strong>
                  </li>
                  <li>
                    <span>Estimated PF</span>
                    <strong>{estimatedPowerFactor === null ? "--" : estimatedPowerFactor.toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Energy rate</span>
                    <strong>{energyPerHourKwh.toFixed(3)} kWh per hour</strong>
                  </li>
                  <li>
                    <span>Live cost rate</span>
                    <strong>{liveCostRatePaisePerHour.toLocaleString("en-IN")} paise/hour</strong>
                  </li>
                  <li>
                    <span>Estimated daily cost</span>
                    <strong>{estimatedDailyCostPaise.toLocaleString("en-IN")} paise/day</strong>
                  </li>
                  <li>
                    <span>Estimated monthly cost</span>
                    <strong>{estimatedMonthlyCostPaise.toLocaleString("en-IN")} paise/month</strong>
                  </li>
                </ul>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <h3>Project Data Flow</h3>
                  <span>End-to-end guide</span>
                </div>
                <ol className="guide-list">
                  <li>ESP32 samples PZEM every 250 ms and evaluates safety limits locally.</li>
                  <li>ESP32 writes one telemetry payload to <code>/devices/socket1/live</code> once per second.</li>
                  <li>Dashboard listens on <code>/devices/socket1</code> and updates charts only on new sample ids.</li>
                  <li>Web switch writes desired relay state to <code>/devices/socket1/control/relayDesired</code>.</li>
                  <li>Fault events are written under <code>/devices/socket1/alerts</code> and shown in notification feed.</li>
                </ol>
              </article>
            </div>

            <article className="panel">
              <div className="panel-header">
                <h3>Project Explanation Checklist</h3>
                <span>Use while presenting</span>
              </div>
              <ol className="guide-list">
                <li>Demonstrate single-write telemetry and explain reduced delay/jitter.</li>
                <li>Show local trip behavior by forcing a threshold event and relay cutoff.</li>
                <li>Show smart-switch command path: desired state vs actual state acknowledgement.</li>
                <li>Explain latency from ESP sample time versus dashboard render time.</li>
                <li>Map each alert to threshold and code for auditability.</li>
              </ol>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ accent, icon, label, value }) {
  return (
    <article className={`stat-card ${accent}`}>
      <div className="stat-head">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <p className="stat-value">{value}</p>
    </article>
  );
}
