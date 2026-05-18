# Design Memory

## Monday Assigned Issues UI Style Memory

- Layout order is fixed as: header title area -> scrollable issue list -> one-line update status anchored at bottom-right below the list.
- The update status line must stay independent from the list scroll area.
- Header actions use icons only:
  - Refresh icon and Open Monday icon at the title right-end when title/header is visible.
  - Same actions appear as hover floating icons in headless mode.
- Auth control is a single toggle icon (plug style):
  - Visible only in Edit mode.
  - Connected/disconnect state is styled in red.
- Group list rules:
  - Hide Done groups (`done`, `completed`, `완료`).
  - Keep compact vertical spacing between group headings and rows.
  - Group headings are slightly larger than item rows.
- Typography scaling policy:
  - Global content font scale applies to widget content only (not widget heads/titles).
  - Widget-level content font scale exists in common widget settings.
  - Scaling preserves relative size ratios between text elements.

## Single-Item Widget Surface Rule

- For widgets that render a single primary content item, only the outer widget surface (`.widget-card`) should be visible.
- Inner content panels/cards inside those widgets must stay transparent with no extra background fill.
- Inner panel borders should also be removed so a second nested surface is not perceived.
- This rule should be applied by default when introducing new single-item widgets.

## Widget List/Footer Layout Baseline

- Default widget layout for list-like or inbox-like widgets is: top controls/tabs -> stable scrollable content region -> bottom-pinned footer/status metadata.
- The footer/status line belongs outside the scrollable content and should sit at the bottom of the widget content area without a divider line by default.
- The widget content host/slot must fill the widget body before relying on `margin-top: auto` or footer flex alignment.
- Repeated item cards must keep stable heights across item counts and widget sizes; do not let list rows stretch with `1fr` or fit-content behavior when populated.
- Empty states can fill the available content region, but populated rows should stay compact and consistent while the list itself handles overflow.
