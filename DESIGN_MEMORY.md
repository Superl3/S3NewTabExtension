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
