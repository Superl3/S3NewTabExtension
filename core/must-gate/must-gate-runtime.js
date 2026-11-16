// Mounts the must gate over the new tab while must items are open.
// It is a page-level view, not a modal: it never traps the user when the bridge is down, unconfigured or throws.
import { renderMustGate } from "./must-gate-view.js";

const ACTION_ERRORS = {
  NOTE_REQUIRED: "결정 항목은 무엇으로 정했는지 한 줄이 필요하다.",
  REASON_REQUIRED: "안 하기로 할 때는 이유 한 줄이 필요하다.",
  DEFER_LIMIT: "이미 두 번 미뤘다. 다 했음·안 하기·나누기 중 하나를 골라야 한다.",
  BAD_DATE: "날짜가 올바르지 않다. 내일부터 7일 뒤까지만 고를 수 있다.",
  BAD_PARTS: "나누기는 2~5개로 해야 한다."
};

const STALE_CODES = new Set(["NOT_FOUND", "NOT_OPEN", "CONFLICT"]);

export function createMustGateRuntime({ documentObj, bridge, appElement = null, host = null }) {
  let overlay = null;
  let state = null;
  let ui = { openId: "", openAction: "", busy: false, error: "" };
  let started = false;
  let visibilityHandler = null;

  function setAppInert(on) {
    if (!appElement) {
      return;
    }
    if (on) {
      appElement.setAttribute?.("inert", "");
      appElement.setAttribute?.("aria-hidden", "true");
    } else {
      appElement.removeAttribute?.("inert");
      appElement.removeAttribute?.("aria-hidden");
    }
  }

  function close() {
    if (overlay) {
      overlay.remove?.();
      overlay = null;
    }
    setAppInert(false);
  }

  function render() {
    if (!state?.gateOpen) {
      close();
      return;
    }
    try {
      const next = renderMustGate({ documentObj, state, ui, handlers });
      if (overlay) {
        overlay.replaceWith(next);
      } else {
        (host || documentObj.body).append(next);
        setAppInert(true);
      }
      overlay = next;
    } catch {
      // Never leave the user behind a gate that cannot draw itself.
      close();
    }
  }

  function applyResult(result) {
    ui = { ...ui, busy: false };
    if (result.ok) {
      state = result.state;
      ui = { openId: "", openAction: "", busy: false, error: "" };
    } else if (result.offline) {
      state = null; // bridge went away mid-session: open the tab
    } else {
      ui = { ...ui, error: ACTION_ERRORS[result.error?.code] || result.error?.message || "처리하지 못했다." };
    }
    render();
    if (!result.ok && !result.offline && STALE_CODES.has(result.error?.code)) {
      void refresh(); // the note changed under us (e.g. edited in Obsidian): show the current list
    }
  }

  const handlers = {
    onToggle(id, action) {
      ui =
        ui.openId === id && ui.openAction === action
          ? { ...ui, openId: "", openAction: "", error: "" }
          : { ...ui, openId: id, openAction: action, error: "" };
      render();
    },
    async onSubmit(id, action, payload) {
      if (ui.busy || typeof bridge[action] !== "function") {
        return;
      }
      ui = { ...ui, busy: true, error: "" };
      render();
      applyResult(await bridge[action](id, payload));
    }
  };

  async function refresh() {
    const result = await bridge.load();
    if (!result.ok) {
      state = null;
      render();
      return result;
    }
    state = result.state;
    render();
    return result;
  }

  return {
    async start() {
      if (started) {
        return;
      }
      started = true;
      await refresh();
      if (typeof documentObj.addEventListener === "function") {
        visibilityHandler = () => {
          if (documentObj.visibilityState === "visible") {
            void refresh();
          }
        };
        documentObj.addEventListener("visibilitychange", visibilityHandler);
      }
    },
    refresh,
    isOpen: () => overlay !== null,
    getState: () => state,
    stop() {
      if (visibilityHandler) {
        documentObj.removeEventListener?.("visibilitychange", visibilityHandler);
        visibilityHandler = null;
      }
      started = false;
      close();
    }
  };
}
