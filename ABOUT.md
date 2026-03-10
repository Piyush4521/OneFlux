# About OneFlux

## Project Summary

OneFlux is a practical IoT energy intelligence system designed to monitor household/appliance power usage in real time and enforce electrical safety through local automation.

The system combines a cloud-connected web dashboard with firmware-level fault handling on ESP32 so that critical protection works even when the internet is unstable.

## Problem Statement

Most low-cost smart plugs provide only basic ON/OFF control and delayed analytics, with limited visibility into power quality or fault behavior. OneFlux addresses this by providing:

- real-time electrical telemetry
- interpretable cost and impact metrics
- deterministic local trip logic for over-limit events
- transparent relay command acknowledgement (desired vs actual state)

## Objectives

- build a reliable live dashboard for project demos and real operation
- implement local threshold-based trip protection on embedded hardware
- maintain a simple Firebase-based cloud data model
- present clear data flow for academic/project presentation use cases

## Architecture at a Glance

- Edge: ESP32 + PZEM004T v3 + relay + manual override button
- Cloud: Firebase Realtime Database
- Frontend: React dashboard with charts, insights, and control UI

Data and command flow:

1. ESP32 samples electrical metrics and performs local safety checks.
2. ESP32 publishes live payloads to Firebase RTDB.
3. Dashboard subscribes for realtime updates and renders analytics.
4. Dashboard writes relay commands to control path.
5. ESP32 polls control path and applies relay state.

## Current Scope

- single device path: `/devices/socket1`
- live telemetry, trends, alerts, and relay controls
- theory and explanation components for presentation

## Roadmap

- multi-device support with device registry
- historical analytics and export reports
- auth and role-based access for control operations
- over-the-air firmware update workflow
