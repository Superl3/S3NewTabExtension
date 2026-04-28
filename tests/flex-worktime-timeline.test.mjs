import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFlexTimelineSegments,
  parseFlexWorkRecordTimelineText
} from "../widgets/flexWorktimeTimeline.js";

test("parseFlexWorkRecordTimelineText parses ongoing work with a completed break", () => {
  const timeline = parseFlexWorkRecordTimelineText(
    "기록 시작 오전 10:50 기록 종료 기록 중 휴게 기록 오후 12:14 - 오후 5:10",
    "2026-04-10",
    new Date("2026-04-10T18:47:00")
  );

  assert.ok(timeline);
  assert.equal(timeline.date, "2026-04-10");
  assert.equal(timeline.isOngoing, true);
  assert.deepEqual(
    timeline.events.map((event) => ({ type: event.type, at: event.at, minutes: event.minutes })),
    [
      { type: "workStart", at: "10:50", minutes: 650 },
      { type: "breakStart", at: "12:14", minutes: 734 },
      { type: "breakEnd", at: "17:10", minutes: 1030 }
    ]
  );
});

test("buildFlexTimelineSegments builds work and break spans from parsed timeline", () => {
  const timeline = parseFlexWorkRecordTimelineText(
    "기록 시작 오전 10:50 기록 종료 기록 중 휴게 기록 오후 12:14 - 오후 5:10",
    "2026-04-10",
    new Date("2026-04-10T18:47:00")
  );

  const segments = buildFlexTimelineSegments(timeline, new Date("2026-04-10T18:47:00"));
  assert.deepEqual(
    segments.map((segment) => ({
      type: segment.type,
      isActive: segment.isActive,
      startLabel: segment.startLabel,
      endLabel: segment.endLabel
    })),
    [
      { type: "work", isActive: false, startLabel: "10:50", endLabel: "12:14" },
      { type: "break", isActive: false, startLabel: "12:14", endLabel: "17:10" },
      { type: "work", isActive: true, startLabel: "17:10", endLabel: "18:47" }
    ]
  );
});

test("parseFlexWorkRecordTimelineText returns null for unrelated text", () => {
  assert.equal(parseFlexWorkRecordTimelineText("오늘 근무 합계 8시간 12분", "2026-04-10"), null);
});

test("parseFlexWorkRecordTimelineText supports short hover summary with no breaks", () => {
  const timeline = parseFlexWorkRecordTimelineText(
    "오전 9:56 휴게 없음",
    "2026-04-14",
    new Date("2026-04-14T15:19:00")
  );

  assert.ok(timeline);
  assert.equal(timeline.isOngoing, true);
  assert.deepEqual(
    timeline.events.map((event) => ({ type: event.type, at: event.at, minutes: event.minutes })),
    [
      { type: "workStart", at: "09:56", minutes: 596 }
    ]
  );

  const segments = buildFlexTimelineSegments(timeline, new Date("2026-04-14T15:19:00"));
  assert.deepEqual(
    segments.map((segment) => ({ type: segment.type, isActive: segment.isActive, startLabel: segment.startLabel, endLabel: segment.endLabel })),
    [
      { type: "work", isActive: true, startLabel: "09:56", endLabel: "15:19" }
    ]
  );
});
