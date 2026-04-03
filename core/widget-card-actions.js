export function attachWidgetTypeActions({
  instance,
  controller,
  selectBtn,
  headActions,
  placeFloatTopAction,
  placeFloatBottomAction
} = {}) {
  if (!instance) {
    return;
  }

  if (instance.type === "bookmarks") {
    const makeActionButton = (className, titleText, iconId, action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.title = titleText;
      btn.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action?.());
      });
      return btn;
    };

    if (typeof controller?.goBack === "function") {
      const floatBack = makeActionButton("icon-btn widget-float-back", "Go back", "i-undo", () => controller.goBack?.());
      placeFloatBottomAction(floatBack);

      const syncBackState = (canGoBack) => {
        const enabled = Boolean(canGoBack);
        floatBack.disabled = !enabled;
        floatBack.title = enabled ? "Go back" : "Go back (root folder)";
      };

      if (typeof controller?.onBackStateChange === "function") {
        controller.onBackStateChange(syncBackState);
      } else {
        syncBackState(typeof controller?.canGoBack === "function" ? controller.canGoBack() : true);
      }
    }

    if (typeof controller?.refresh === "function") {
      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        "Refresh bookmarks",
        "i-reset",
        () => controller.refresh?.()
      );
      placeFloatBottomAction(floatRefresh);
    }
  }

  if (instance.type === "mondayAssigned" || instance.type === "mondayMeetingNote") {
    const makeActionButton = (className, titleText, iconId, action, onAfter = null) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.title = titleText;
      btn.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action?.()).finally(() => {
          onAfter?.();
        });
      });
      return btn;
    };

    const placeHeadAction = (btn) => {
      if (selectBtn?.parentElement === headActions) {
        headActions.insertBefore(btn, selectBtn);
      } else {
        headActions?.prepend(btn);
      }
    };

    const runRefresh = () => {
      if (typeof controller?.manualRefresh === "function") {
        return controller.manualRefresh();
      } else if (typeof controller?.refresh === "function") {
        return controller.refresh();
      }
      return null;
    };

    const runOpenMonday = () => {
      if (typeof controller?.openMonday === "function") {
        return controller.openMonday();
      }
      return null;
    };

    const runToggleAuth = () => {
      if (typeof controller?.toggleConnection === "function") {
        return controller.toggleConnection();
      }
      return null;
    };

    const authButtons = [];
    const syncAuthButtonState = () => {
      const connected =
        typeof controller?.isConnected === "function" ? Boolean(controller.isConnected()) : false;
      for (const btn of authButtons) {
        const iconUse = btn.querySelector("use");
        if (iconUse) {
          iconUse.setAttribute("href", connected ? "#i-disconnect" : "#i-connect");
        }
        btn.classList.toggle("is-disconnect", connected);
        btn.title = connected ? "Disconnect Monday" : "Connect Monday";
      }
    };

    if (
      typeof controller?.manualRefresh === "function" ||
      typeof controller?.refresh === "function"
    ) {
      const headRefresh = makeActionButton(
        "icon-btn widget-refresh-btn",
        "Refresh Monday data",
        "i-reset",
        runRefresh,
        syncAuthButtonState
      );
      placeHeadAction(headRefresh);

      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        "Refresh Monday data",
        "i-reset",
        runRefresh,
        syncAuthButtonState
      );
      placeFloatBottomAction(floatRefresh);
    }

    if (typeof controller?.openMonday === "function") {
      const headOpen = makeActionButton(
        "icon-btn widget-open-btn",
        "Open Monday",
        "i-open",
        runOpenMonday
      );
      placeHeadAction(headOpen);

      const floatOpen = makeActionButton(
        "icon-btn widget-float-open",
        "Open Monday",
        "i-open",
        runOpenMonday
      );
      placeFloatTopAction(floatOpen);
    }

    if (typeof controller?.toggleConnection === "function") {
      const headAuth = makeActionButton(
        "icon-btn widget-auth-toggle-btn",
        "Connect Monday",
        "i-connect",
        runToggleAuth,
        syncAuthButtonState
      );
      const floatAuth = makeActionButton(
        "icon-btn widget-float-auth-toggle",
        "Connect Monday",
        "i-connect",
        runToggleAuth,
        syncAuthButtonState
      );
      authButtons.push(headAuth, floatAuth);
      placeHeadAction(headAuth);
      placeFloatTopAction(floatAuth);
      syncAuthButtonState();
    }
  }

  if (instance.type === "gmail" || instance.type === "calendar") {
    const refreshTitle = instance.type === "gmail" ? "Refresh unread mail" : "Refresh events";
    const openTitle = instance.type === "gmail" ? "Open Gmail" : "Open Google Calendar";
    const switchTitle = instance.type === "gmail" ? "Switch Gmail account" : "Switch Calendar account";

    const makeActionButton = (className, titleText, iconId, action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.title = titleText;
      btn.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action?.());
      });
      return btn;
    };

    const placeHeadAction = (btn) => {
      if (selectBtn?.parentElement === headActions) {
        headActions.insertBefore(btn, selectBtn);
      } else {
        headActions?.prepend(btn);
      }
    };

    const runRefresh = () => {
      if (typeof controller?.manualRefresh === "function") {
        return controller.manualRefresh();
      }
      if (typeof controller?.refresh === "function") {
        return controller.refresh();
      }
      return null;
    };

    const runOpen = () => {
      if (typeof controller?.openGmail === "function") {
        return controller.openGmail();
      }
      if (typeof controller?.openCalendar === "function") {
        return controller.openCalendar();
      }
      return null;
    };

    const runSwitchAccount = () => {
      if (typeof controller?.switchAccount === "function") {
        return controller.switchAccount();
      }
      return null;
    };

    const canSwitchAccount = () => {
      if (typeof controller?.canSwitchAccount === "function") {
        return Boolean(controller.canSwitchAccount());
      }
      return true;
    };

    if (typeof controller?.manualRefresh === "function" || typeof controller?.refresh === "function") {
      const headRefresh = makeActionButton(
        "icon-btn widget-refresh-btn",
        refreshTitle,
        "i-reset",
        runRefresh
      );
      placeHeadAction(headRefresh);

      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        refreshTitle,
        "i-reset",
        runRefresh
      );
      placeFloatBottomAction(floatRefresh);
    }

    if (typeof controller?.openGmail === "function" || typeof controller?.openCalendar === "function") {
      const headOpen = makeActionButton(
        "icon-btn widget-open-btn",
        openTitle,
        "i-open",
        runOpen
      );
      placeHeadAction(headOpen);

      const floatOpen = makeActionButton(
        "icon-btn widget-float-open",
        openTitle,
        "i-open",
        runOpen
      );
      placeFloatTopAction(floatOpen);
    }

    if (typeof controller?.switchAccount === "function") {
      const headSwitch = makeActionButton(
        "icon-btn widget-switch-account-btn",
        switchTitle,
        "i-redo",
        runSwitchAccount
      );
      placeHeadAction(headSwitch);

      const floatSwitch = makeActionButton(
        "icon-btn widget-float-switch-account",
        switchTitle,
        "i-redo",
        runSwitchAccount
      );
      placeFloatTopAction(floatSwitch);

      const syncSwitchState = () => {
        const enabled = canSwitchAccount();
        headSwitch.disabled = !enabled;
        floatSwitch.disabled = !enabled;
        headSwitch.hidden = !enabled;
        floatSwitch.hidden = !enabled;
      };

      syncSwitchState();
    }
  }

  if (instance.type === "githubPrList") {
    const makeActionButton = (className, titleText, iconId, action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.title = titleText;
      btn.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action?.());
      });
      return btn;
    };

    const placeHeadAction = (btn) => {
      if (selectBtn?.parentElement === headActions) {
        headActions.insertBefore(btn, selectBtn);
      } else {
        headActions?.prepend(btn);
      }
    };

    const runRefresh = () => {
      if (typeof controller?.manualRefresh === "function") {
        return controller.manualRefresh();
      }
      if (typeof controller?.refresh === "function") {
        return controller.refresh();
      }
      return null;
    };

    const runOpenRepository = () => {
      if (typeof controller?.openRepository === "function") {
        return controller.openRepository();
      }
      return null;
    };

    if (
      typeof controller?.manualRefresh === "function" ||
      typeof controller?.refresh === "function"
    ) {
      const headRefresh = makeActionButton(
        "icon-btn widget-refresh-btn",
        "Refresh pull requests",
        "i-reset",
        runRefresh
      );
      placeHeadAction(headRefresh);

      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        "Refresh pull requests",
        "i-reset",
        runRefresh
      );
      placeFloatBottomAction(floatRefresh);
    }

    if (typeof controller?.openRepository === "function") {
      const headOpen = makeActionButton(
        "icon-btn widget-open-btn",
        "Open repository",
        "i-open",
        runOpenRepository
      );
      placeHeadAction(headOpen);

      const floatOpen = makeActionButton(
        "icon-btn widget-float-open",
        "Open repository",
        "i-open",
        runOpenRepository
      );
      placeFloatTopAction(floatOpen);
    }
  }
}
