import test from "node:test";
import assert from "node:assert/strict";

import { resolveFlexWorktimeDetailUrl } from "../widgets/shared/flexWorktimeRows.js";

test("Flex worktime detail URL helper resolves placeholders safely", () => {
  const entry = {
    placeholders: {
      id: "member 1",
      duration: "8h 10m"
    },
    rawEntry: {
      nested: {
        value: "raw value"
      }
    }
  };

  assert.equal(
    resolveFlexWorktimeDetailUrl(
      {
        detailUrlTemplate: "https://example.com/work?date={date}&id={id}&raw={entry.nested.value}&missing={missing}"
      },
      "2026-07-02",
      entry
    ),
    "https://example.com/work?date=2026-07-02&id=member%201&raw=raw%20value&missing="
  );

  assert.equal(
    resolveFlexWorktimeDetailUrl({ detailUrlTemplate: "javascript:alert({id})" }, "2026-07-02", entry),
    ""
  );
  assert.equal(resolveFlexWorktimeDetailUrl({ detailUrlTemplate: "" }, "2026-07-02", entry), "");
});
