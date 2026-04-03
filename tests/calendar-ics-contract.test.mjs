import test from "node:test";
import assert from "node:assert/strict";

import { parseIcsEventsForContractTest } from "../widgets/calendar.js";
import { parseIcsEvents } from "../widgets/shared/icsParser.js";

test("parses timed and all-day ICS events while skipping cancelled entries", () => {
  const icsText = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:event-1@example.com",
    "SUMMARY:Daily standup",
    "DTSTART:20300106T010000Z",
    "URL:https://calendar.google.com/calendar/event?eid=abc",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:event-2@example.com",
    "SUMMARY:Public holiday",
    "DTSTART;VALUE=DATE:20300107",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:event-3@example.com",
    "SUMMARY:Cancelled meeting",
    "STATUS:CANCELLED",
    "DTSTART:20300108T020000Z",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\n");

  const events = parseIcsEventsForContractTest(icsText, "https://calendar.google.com/calendar/u/0/r");
  assert.equal(events.length, 2);

  const timed = events.find((event) => event.id === "event-1@example.com");
  assert.equal(Boolean(timed), true);
  assert.equal(timed?.allDay, false);
  assert.match(timed?.link || "", /calendar\.google\.com/);

  const allDay = events.find((event) => event.id === "event-2@example.com");
  assert.equal(Boolean(allDay), true);
  assert.equal(allDay?.allDay, true);
  assert.equal(allDay?.timeLabel, "All day");
});

test("supports folded summary lines and fallback links", () => {
  const icsText = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:event-4@example.com",
    "SUMMARY:Quarterly planning and",
    " continuation notes",
    "DTSTART:20300211T090000",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\n");

  const fallbackLink = "https://calendar.google.com/calendar/u/0/r";
  const events = parseIcsEventsForContractTest(icsText, fallbackLink);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.title, "Quarterly planning andcontinuation notes");
  assert.equal(events[0]?.link, fallbackLink);
});

test("shared ICS parser keeps raw URL and date mapping generic", () => {
  const icsText = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:event-5@example.com",
    "SUMMARY:Roadmap sync",
    "DTSTART:20300312T101500Z",
    "URL:webcal://calendar.google.com/calendar/event?eid=raw",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\n");

  const events = parseIcsEvents(icsText);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.url, "webcal://calendar.google.com/calendar/event?eid=raw");
  assert.equal(events[0]?.allDay, false);
  assert.equal(typeof events[0]?.startTs, "number");
});
