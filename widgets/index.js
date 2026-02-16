import { clockWidget } from "./clock.js";
import { searchWidget } from "./search.js";
import { aiChatWidget } from "./aiChat.js";
import { bookmarksWidget } from "./bookmarks.js";
import { todoWidget } from "./todo.js";
import { notesWidget } from "./notes.js";
import { labelWidget } from "./label.js";
import { shortcutWidget } from "./shortcut.js";

export const widgetRegistry = {
  [clockWidget.type]: clockWidget,
  [searchWidget.type]: searchWidget,
  [aiChatWidget.type]: aiChatWidget,
  [bookmarksWidget.type]: bookmarksWidget,
  [todoWidget.type]: todoWidget,
  [notesWidget.type]: notesWidget,
  [labelWidget.type]: labelWidget,
  [shortcutWidget.type]: shortcutWidget
};

export const widgetList = Object.values(widgetRegistry);
