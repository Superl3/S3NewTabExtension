import test from "node:test";
import assert from "node:assert/strict";

import { buildWeatherSnapshotForContractTest } from "../widgets/weather.js";

test("maps open-meteo payload into weather snapshot", () => {
  const snapshot = buildWeatherSnapshotForContractTest(
    {
      name: "Seoul",
      admin1: "Seoul",
      country: "Korea"
    },
    {
      current: {
        temperature_2m: 21.2,
        apparent_temperature: 22.1,
        relative_humidity_2m: 55,
        weather_code: 3,
        wind_speed_10m: 6.4,
        is_day: 1
      },
      current_units: {
        temperature_2m: "°C",
        wind_speed_10m: "km/h"
      },
      daily: {
        temperature_2m_max: [26.1],
        temperature_2m_min: [18.4]
      }
    },
    {
      locationQuery: "Seoul",
      temperatureUnit: "celsius"
    }
  );

  assert.equal(snapshot.locationLabel.includes("Seoul"), true);
  assert.equal(snapshot.conditionLabel, "Overcast");
  assert.equal(snapshot.temperatureUnit, "°C");
  assert.equal(snapshot.windUnit, "km/h");
  assert.equal(snapshot.high, 26.1);
  assert.equal(snapshot.low, 18.4);
});

test("falls back to default units and null-safe numeric fields", () => {
  const snapshot = buildWeatherSnapshotForContractTest(
    { name: "Unknown" },
    {
      current: {
        weather_code: 999,
        is_day: 0
      },
      daily: {}
    },
    {
      locationQuery: "Unknown",
      temperatureUnit: "fahrenheit"
    }
  );

  assert.equal(snapshot.temperatureUnit, "°F");
  assert.equal(snapshot.windUnit, "km/h");
  assert.equal(snapshot.temperature, null);
  assert.equal(snapshot.high, null);
  assert.equal(snapshot.low, null);
  assert.equal(typeof snapshot.conditionLabel, "string");
  assert.equal(typeof snapshot.conditionIcon, "string");
});
