import { clockWidget } from "./clock.js";
import { searchWidget } from "./search.js";
import { aiChatWidget } from "./aiChat.js";
import { bookmarksWidget } from "./bookmarks.js";
import { todoWidget } from "./todo.js";
import { notesWidget } from "./notes.js";
import { labelWidget } from "./label.js";
import { shortcutWidget } from "./shortcut.js";
import { gmailWidget } from "./gmail.js";
import { rssWidget } from "./rss.js";
import { calendarWidget } from "./calendar.js";
import { mondayAssignedWidget } from "./mondayAssigned.js";
import { mondayMeetingNoteWidget } from "./mondayMeetingNote.js";
import { githubPrListWidget } from "./githubPrList.js";
import { flexWorktimeWidget } from "./flexWorktime.js";
import { weatherWidget } from "./weather.js";
import { containerWidget } from "./container.js";
import { codexUsageWidget } from "./codexUsage.js";

export const widgetRegistry = {
  [clockWidget.type]: clockWidget,
  [searchWidget.type]: searchWidget,
  [aiChatWidget.type]: aiChatWidget,
  [bookmarksWidget.type]: bookmarksWidget,
  [todoWidget.type]: todoWidget,
  [notesWidget.type]: notesWidget,
  [labelWidget.type]: labelWidget,
  [shortcutWidget.type]: shortcutWidget,
  [gmailWidget.type]: gmailWidget,
  [rssWidget.type]: rssWidget,
  [calendarWidget.type]: calendarWidget,
  [mondayAssignedWidget.type]: mondayAssignedWidget,
  [mondayMeetingNoteWidget.type]: mondayMeetingNoteWidget,
  [githubPrListWidget.type]: githubPrListWidget,
  [flexWorktimeWidget.type]: flexWorktimeWidget,
  [weatherWidget.type]: weatherWidget,
  [containerWidget.type]: containerWidget,
  [codexUsageWidget.type]: codexUsageWidget
};

export const widgetList = Object.values(widgetRegistry);
