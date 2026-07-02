function createActionButton(className, titleText, iconId, action, onAfter = null) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = titleText;
  btn.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const result = Promise.resolve(action?.());
    if (typeof onAfter === "function") {
      result.finally(() => {
        onAfter();
      });
    }
  });
  return btn;
}

function placeHeadActionBeforeSelect(btn, selectBtn, headActions) {
  if (selectBtn?.parentElement === headActions) {
    headActions.insertBefore(btn, selectBtn);
  } else {
    headActions?.prepend(btn);
  }
}

function hasControllerMethod(controller, names) {
  return names.some((name) => typeof controller?.[name] === "function");
}

function runFirstControllerMethod(controller, names) {
  const name = names.find((candidate) => typeof controller?.[candidate] === "function");
  return name ? controller[name]() : null;
}

function addHeadAndFloatAction({
  selectBtn,
  headActions,
  placeFloatAction,
  headClassName,
  floatClassName,
  titleText,
  iconId,
  action,
  onAfter = null
}) {
  const headBtn = createActionButton(headClassName, titleText, iconId, action, onAfter);
  const floatBtn = createActionButton(floatClassName, titleText, iconId, action, onAfter);
  placeHeadActionBeforeSelect(headBtn, selectBtn, headActions);
  placeFloatAction(floatBtn);
  return [headBtn, floatBtn];
}

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
    if (typeof controller?.goBack === "function") {
      const floatBack = createActionButton("icon-btn widget-float-back", "Go back", "i-undo", () => controller.goBack?.());
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
      const floatRefresh = createActionButton(
        "icon-btn widget-float-refresh",
        "Refresh bookmarks",
        "i-reset",
        () => controller.refresh?.()
      );
      placeFloatBottomAction(floatRefresh);
    }
  }

  if (instance.type === "mondayAssigned" || instance.type === "mondayMeetingNote") {
    const runRefresh = () => runFirstControllerMethod(controller, ["manualRefresh", "refresh"]);
    const runOpenMonday = () => runFirstControllerMethod(controller, ["openMonday"]);
    const runToggleAuth = () => runFirstControllerMethod(controller, ["toggleConnection"]);

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

    if (hasControllerMethod(controller, ["manualRefresh", "refresh"])) {
      addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatBottomAction,
        headClassName: "icon-btn widget-refresh-btn",
        floatClassName: "icon-btn widget-float-refresh",
        titleText: "Refresh Monday data",
        iconId: "i-reset",
        action: runRefresh,
        onAfter: syncAuthButtonState
      });
    }

    if (typeof controller?.openMonday === "function") {
      addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatTopAction,
        headClassName: "icon-btn widget-open-btn",
        floatClassName: "icon-btn widget-float-open",
        titleText: "Open Monday",
        iconId: "i-open",
        action: runOpenMonday
      });
    }

    if (typeof controller?.toggleConnection === "function") {
      const [headAuth, floatAuth] = addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatTopAction,
        headClassName: "icon-btn widget-auth-toggle-btn",
        floatClassName: "icon-btn widget-float-auth-toggle",
        titleText: "Connect Monday",
        iconId: "i-connect",
        action: runToggleAuth,
        onAfter: syncAuthButtonState
      });
      authButtons.push(headAuth, floatAuth);
      syncAuthButtonState();
    }
  }

  if (instance.type === "gmail" || instance.type === "calendar") {
    const labelByType = {
      gmail: {
        refresh: "Refresh unread mail",
        open: "Open Gmail",
        switchAccount: "Switch Gmail account"
      },
      calendar: {
        refresh: "Refresh events",
        open: "Open Google Calendar",
        switchAccount: "Switch Calendar account"
      }
    };
    const labels = labelByType[instance.type];
    const runRefresh = () => runFirstControllerMethod(controller, ["manualRefresh", "refresh"]);
    const runOpen = () => runFirstControllerMethod(controller, ["openGmail", "openCalendar"]);
    const runSwitchAccount = () => runFirstControllerMethod(controller, ["switchAccount"]);

    const canSwitchAccount = () => {
      if (typeof controller?.canSwitchAccount === "function") {
        return Boolean(controller.canSwitchAccount());
      }
      return true;
    };

    if (hasControllerMethod(controller, ["manualRefresh", "refresh"])) {
      addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatBottomAction,
        headClassName: "icon-btn widget-refresh-btn",
        floatClassName: "icon-btn widget-float-refresh",
        titleText: labels.refresh,
        iconId: "i-reset",
        action: runRefresh
      });
    }

    if (hasControllerMethod(controller, ["openGmail", "openCalendar"])) {
      addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatTopAction,
        headClassName: "icon-btn widget-open-btn",
        floatClassName: "icon-btn widget-float-open",
        titleText: labels.open,
        iconId: "i-open",
        action: runOpen
      });
    }

    if (typeof controller?.switchAccount === "function") {
      const [headSwitch, floatSwitch] = addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatTopAction,
        headClassName: "icon-btn widget-switch-account-btn",
        floatClassName: "icon-btn widget-float-switch-account",
        titleText: labels.switchAccount,
        iconId: "i-redo",
        action: runSwitchAccount
      });

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

  if (instance.type === "githubPrList" || instance.type === "githubReviewInbox") {
    const isReviewInbox = instance.type === "githubReviewInbox";
    const refreshTitle = isReviewInbox ? "Refresh review inbox" : "Refresh pull requests";
    const openTitle = isReviewInbox ? "Open repository pull requests" : "Open repository";
    const runRefresh = () => runFirstControllerMethod(controller, ["manualRefresh", "refresh"]);
    const runOpenRepository = () => runFirstControllerMethod(controller, ["openRepository"]);

    if (hasControllerMethod(controller, ["manualRefresh", "refresh"])) {
      addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatBottomAction,
        headClassName: "icon-btn widget-refresh-btn",
        floatClassName: "icon-btn widget-float-refresh",
        titleText: refreshTitle,
        iconId: "i-reset",
        action: runRefresh
      });
    }

    if (typeof controller?.openRepository === "function") {
      addHeadAndFloatAction({
        selectBtn,
        headActions,
        placeFloatAction: placeFloatTopAction,
        headClassName: "icon-btn widget-open-btn",
        floatClassName: "icon-btn widget-float-open",
        titleText: openTitle,
        iconId: "i-open",
        action: runOpenRepository
      });
    }
  }
}
