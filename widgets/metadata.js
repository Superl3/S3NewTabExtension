export const widgetMetadata = [
  {
    "type": "clock",
    "title": "Clock",
    "defaultConfig": {
      "locale": "ko-KR",
      "hour12": false,
      "showSeconds": true,
      "showWeekday": true,
      "dateFormat": "yyyy-MM-dd",
      "timeZone": "",
      "fontFamily": "mono",
      "styleVariant": "minimal",
      "textAlign": "center",
      "timeFontSize": 2.4,
      "weekdayFontSize": 0.88,
      "shadowed": false
    },
    "defaultLayout": {
      "x": 40,
      "y": 40,
      "w": 320,
      "h": 170
    },
    "settingsSchema": [
      {
        "key": "locale",
        "label": "Locale",
        "type": "text",
        "placeholder": "ko-KR"
      },
      {
        "key": "timeZone",
        "label": "Time zone",
        "type": "text",
        "placeholder": "Asia/Seoul"
      },
      {
        "key": "fontFamily",
        "label": "Clock font",
        "type": "select",
        "options": [
          {
            "value": "mono",
            "label": "Mono"
          },
          {
            "value": "display",
            "label": "Display"
          },
          {
            "value": "digital",
            "label": "Digital"
          }
        ]
      },
      {
        "key": "styleVariant",
        "label": "Clock style",
        "type": "select",
        "options": [
          {
            "value": "minimal",
            "label": "Minimal"
          },
          {
            "value": "tile",
            "label": "Tile"
          },
          {
            "value": "glow",
            "label": "Glow"
          }
        ]
      },
      {
        "key": "textAlign",
        "label": "Text align",
        "type": "select",
        "options": [
          {
            "value": "left",
            "label": "Left"
          },
          {
            "value": "center",
            "label": "Center"
          },
          {
            "value": "right",
            "label": "Right"
          }
        ]
      },
      {
        "key": "dateFormat",
        "label": "Date format",
        "type": "select",
        "options": [
          {
            "value": "yyyy-MM-dd",
            "label": "yyyy-MM-dd"
          },
          {
            "value": "yyyy.MM.dd",
            "label": "yyyy.MM.dd"
          },
          {
            "value": "dd-MM-yyyy",
            "label": "dd-MM-yyyy"
          },
          {
            "value": "MM/dd/yyyy",
            "label": "MM/dd/yyyy"
          }
        ]
      },
      {
        "key": "timeFontSize",
        "label": "Time font size (em)",
        "type": "number",
        "min": 1,
        "max": 6,
        "step": 0.1
      },
      {
        "key": "weekdayFontSize",
        "label": "Weekday font size (em)",
        "type": "number",
        "min": 0.5,
        "max": 2.4,
        "step": 0.05
      },
      {
        "key": "hour12",
        "label": "12-hour",
        "type": "checkbox"
      },
      {
        "key": "showSeconds",
        "label": "Show seconds",
        "type": "checkbox"
      },
      {
        "key": "showWeekday",
        "label": "Show weekday",
        "type": "checkbox"
      },
      {
        "key": "shadowed",
        "label": "Shadowed",
        "type": "checkbox"
      }
    ]
  },
  {
    "type": "search",
    "title": "Search",
    "defaultConfig": {
      "provider": "google",
      "placeholder": "Search the web"
    },
    "defaultLayout": {
      "x": 390,
      "y": 40,
      "w": 430,
      "h": 120
    },
    "settingsSchema": [
      {
        "key": "provider",
        "label": "Search provider",
        "type": "select",
        "options": [
          {
            "value": "google",
            "label": "Google"
          },
          {
            "value": "naver",
            "label": "Naver"
          },
          {
            "value": "duckduckgo",
            "label": "DuckDuckGo"
          },
          {
            "value": "brave",
            "label": "Brave"
          }
        ]
      },
      {
        "key": "placeholder",
        "label": "Placeholder",
        "type": "text",
        "placeholder": "Search"
      }
    ]
  },
  {
    "type": "aiChat",
    "title": "AI Chat",
    "defaultConfig": {
      "providerMode": "chatgpt",
      "endpoint": "",
      "connectorUrl": "http://localhost:8787/api/auth/start",
      "accessToken": "",
      "model": "gpt-4o-mini",
      "systemPrompt": "You are a concise assistant in a browser new tab widget.",
      "temperature": 0.7,
      "history": []
    },
    "defaultLayout": {
      "x": 40,
      "y": 560,
      "w": 520,
      "h": 300
    },
    "settingsSchema": [
      {
        "key": "providerMode",
        "label": "Mode",
        "type": "select",
        "options": [
          {
            "value": "chatgpt",
            "label": "ChatGPT"
          },
          {
            "value": "browser",
            "label": "Browser mode"
          }
        ]
      },
      {
        "key": "endpoint",
        "label": "Endpoint (optional override)",
        "type": "text",
        "placeholder": "https://..."
      },
      {
        "key": "connectorUrl",
        "label": "Auth connector URL",
        "type": "url",
        "placeholder": "http://localhost:8787/api/auth/start",
        "helpText": "Connector should redirect to this extension with access_token (optionally account/email/user)."
      },
      {
        "key": "accessToken",
        "label": "Access token (optional)",
        "type": "password",
        "placeholder": "OpenAI access token",
        "helpText": "If set, Connect uses this token directly and skips connector popup/relay."
      },
      {
        "key": "model",
        "label": "Model",
        "type": "text",
        "placeholder": "gpt-4o-mini"
      },
      {
        "key": "temperature",
        "label": "Temperature",
        "type": "number",
        "min": 0,
        "max": 2,
        "step": 0.1
      },
      {
        "key": "systemPrompt",
        "label": "System prompt",
        "type": "textarea"
      }
    ]
  },
  {
    "type": "bookmarks",
    "title": "Bookmarks Collection",
    "defaultConfig": {
      "folderPath": "",
      "folderId": "0",
      "showFolders": true,
      "showLabels": true,
      "pathVisibility": "headless",
      "openInNewTab": false,
      "faviconMode": "site",
      "fontScale": 1,
      "labelMap": {},
      "iconMap": {},
      "urlMap": {},
      "collapsedMap": {}
    },
    "defaultLayout": {
      "x": 840,
      "y": 40,
      "w": 360,
      "h": 490
    },
    "settingsSchema": [
      {
        "key": "folderId",
        "label": "Folder",
        "type": "bookmark-folder-select",
        "helpText": "Choose folder directly from bookmarks tree."
      },
      {
        "key": "folderPath",
        "label": "Folder path (optional fallback)",
        "type": "text",
        "placeholder": "Bookmarks bar/Work"
      },
      {
        "key": "faviconMode",
        "label": "Favicon source",
        "type": "select",
        "options": [
          {
            "value": "site",
            "label": "Website favicon"
          },
          {
            "value": "none",
            "label": "No favicon"
          }
        ]
      },
      {
        "key": "showFolders",
        "label": "Show folders",
        "type": "checkbox"
      },
      {
        "key": "showLabels",
        "label": "Show labels",
        "type": "checkbox"
      },
      {
        "key": "pathVisibility",
        "label": "Current path visibility",
        "type": "select",
        "options": [
          {
            "value": "headless",
            "label": "Hide in headless"
          },
          {
            "value": "always",
            "label": "Always show"
          },
          {
            "value": "hidden",
            "label": "Always hide"
          }
        ]
      },
      {
        "key": "openInNewTab",
        "label": "Open links in new tab",
        "type": "checkbox"
      },
      {
        "key": "fontScale",
        "label": "Grid font scale",
        "type": "number",
        "min": 0.75,
        "max": 1.6,
        "step": 0.05
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "todo",
    "title": "TODO",
    "defaultConfig": {
      "items": []
    },
    "defaultLayout": {
      "x": 40,
      "y": 240,
      "w": 370,
      "h": 290
    },
    "settingsSchema": []
  },
  {
    "type": "notes",
    "title": "Notes",
    "defaultConfig": {
      "content": "",
      "placeholder": "Write your notes here",
      "textAlign": "left"
    },
    "defaultLayout": {
      "x": 430,
      "y": 240,
      "w": 390,
      "h": 290
    },
    "settingsSchema": [
      {
        "key": "placeholder",
        "label": "Placeholder",
        "type": "text",
        "placeholder": "Write notes"
      },
      {
        "key": "textAlign",
        "label": "Text align",
        "type": "select",
        "options": [
          {
            "value": "left",
            "label": "Left"
          },
          {
            "value": "center",
            "label": "Center"
          },
          {
            "value": "right",
            "label": "Right"
          }
        ]
      }
    ]
  },
  {
    "type": "label",
    "title": "Label",
    "defaultConfig": {
      "text": "Your Label",
      "autoContrastOnTransparent": true,
      "color": "#ffffff",
      "fontSize": 36,
      "fontWeight": 700,
      "align": "center"
    },
    "defaultLayout": {
      "x": 580,
      "y": 570,
      "w": 560,
      "h": 150
    },
    "settingsSchema": [
      {
        "key": "text",
        "label": "Text",
        "type": "textarea",
        "placeholder": "Type your text"
      },
      {
        "key": "autoContrastOnTransparent",
        "label": "Auto contrast in transparent mode",
        "type": "checkbox",
        "helpText": "When surface mode is transparent, pick light/dark label color from background tone automatically."
      },
      {
        "key": "color",
        "label": "Text color",
        "type": "color"
      },
      {
        "key": "fontSize",
        "label": "Font size",
        "type": "number",
        "min": 12,
        "max": 128,
        "step": 1
      },
      {
        "key": "fontWeight",
        "label": "Font weight",
        "type": "number",
        "min": 200,
        "max": 900,
        "step": 100
      },
      {
        "key": "align",
        "label": "Align",
        "type": "select",
        "options": [
          {
            "value": "left",
            "label": "Left"
          },
          {
            "value": "center",
            "label": "Center"
          },
          {
            "value": "right",
            "label": "Right"
          }
        ]
      }
    ]
  },
  {
    "type": "shortcut",
    "title": "Shortcut",
    "defaultConfig": {
      "label": "Shortcut",
      "url": "https://www.google.com",
      "icon": "",
      "faviconMode": "site",
      "openInNewTab": false,
      "useGlobalIconSize": true,
      "iconSizePercent": 100
    },
    "defaultLayout": {
      "x": 980,
      "y": 560,
      "w": 120,
      "h": 120
    },
    "settingsSchema": [
      {
        "key": "label",
        "label": "Label",
        "type": "text",
        "placeholder": "Shortcut"
      },
      {
        "key": "url",
        "label": "Target URL",
        "type": "url",
        "placeholder": "https://example.com"
      },
      {
        "key": "icon",
        "label": "Icon (emoji or image URL)",
        "type": "text",
        "placeholder": "⭐ or https://example.com/icon.png"
      },
      {
        "key": "iconEditor",
        "label": "Icon editor",
        "type": "shortcut-icon-editor",
        "helpText": "Draw or import an image and apply it as icon."
      },
      {
        "key": "faviconMode",
        "label": "Icon source",
        "type": "select",
        "options": [
          {
            "value": "site",
            "label": "Website favicon"
          },
          {
            "value": "none",
            "label": "No favicon"
          }
        ]
      },
      {
        "key": "openInNewTab",
        "label": "Open in new tab",
        "type": "checkbox"
      },
      {
        "key": "useGlobalIconSize",
        "label": "Use global icon size",
        "type": "checkbox"
      },
      {
        "key": "iconSizePercent",
        "label": "Icon size (%)",
        "type": "number",
        "min": 40,
        "max": 220,
        "step": 5
      }
    ],
    "defaultGridSize": {
      "w": 1,
      "h": 1
    }
  },
  {
    "type": "gmail",
    "title": "Gmail",
    "defaultConfig": {
      "accountIndex": 0,
      "maxResults": 6,
      "refreshMinutes": 5,
      "showSnippet": true,
      "openInNewTab": true
    },
    "defaultLayout": {
      "x": 560,
      "y": 560,
      "w": 540,
      "h": 320
    },
    "settingsSchema": [
      {
        "key": "accountIndex",
        "label": "Account index (u/N)",
        "type": "number",
        "min": 0,
        "max": 9,
        "step": 1,
        "helpText": "Use 0 for the primary signed-in Gmail account."
      },
      {
        "key": "maxResults",
        "label": "Unread mail count",
        "type": "number",
        "min": 1,
        "max": 20,
        "step": 1
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 120,
        "step": 1
      },
      {
        "key": "showSnippet",
        "label": "Show snippet",
        "type": "checkbox"
      },
      {
        "key": "openInNewTab",
        "label": "Open mail in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "rss",
    "title": "RSS Feed",
    "defaultConfig": {
      "feedPreset": "geekNews",
      "feedUrl": "https://news.hada.io/rss/news",
      "maxItems": 8,
      "showSummary": true,
      "refreshMinutes": 15,
      "openInNewTab": true
    },
    "defaultLayout": {
      "x": 40,
      "y": 40,
      "w": 430,
      "h": 340
    },
    "settingsSchema": [
      {
        "key": "feedPreset",
        "label": "Feed preset",
        "type": "select",
        "options": [
          {
            "value": "geekNews",
            "label": "GeekNews (news.hada.io)"
          },
          {
            "value": "bbcWorld",
            "label": "BBC World"
          },
          {
            "value": "custom",
            "label": "Custom URL"
          }
        ]
      },
      {
        "key": "feedUrl",
        "label": "Custom feed URL",
        "type": "url",
        "placeholder": "https://example.com/rss.xml",
        "helpText": "Used when Feed preset is Custom URL."
      },
      {
        "key": "maxItems",
        "label": "Items to show",
        "type": "number",
        "min": 1,
        "max": 30,
        "step": 1
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 240,
        "step": 1
      },
      {
        "key": "showSummary",
        "label": "Show summary",
        "type": "checkbox"
      },
      {
        "key": "openInNewTab",
        "label": "Open in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "geekNews",
    "title": "GeekNews",
    "hiddenFromAddWidget": true,
    "defaultConfig": {
      "feedPreset": "geekNews",
      "feedUrl": "https://news.hada.io/rss/news",
      "maxItems": 10,
      "showSummary": true,
      "refreshMinutes": 15,
      "openInNewTab": true
    },
    "defaultLayout": {
      "x": 40,
      "y": 40,
      "w": 460,
      "h": 360
    },
    "settingsSchema": [
      {
        "key": "maxItems",
        "label": "Items to show",
        "type": "number",
        "min": 1,
        "max": 30,
        "step": 1
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 240,
        "step": 1
      },
      {
        "key": "showSummary",
        "label": "Show summary",
        "type": "checkbox"
      },
      {
        "key": "openInNewTab",
        "label": "Open in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "calendar",
    "title": "Calendar",
    "defaultConfig": {
      "accountIndex": 0,
      "icsUrl": "",
      "maxResults": 8,
      "daysAhead": 21,
      "refreshMinutes": 30,
      "viewMode": "month",
      "weekStartsOn": "monday",
      "showLocation": true,
      "openInNewTab": true
    },
    "defaultLayout": {
      "x": 1060,
      "y": 80,
      "w": 460,
      "h": 420
    },
    "settingsSchema": [
      {
        "key": "accountIndex",
        "label": "Account index (u/N)",
        "type": "number",
        "min": 0,
        "max": 9,
        "step": 1,
        "helpText": "Use 0 for the primary signed-in Google account (used for auto setup)."
      },
      {
        "key": "icsUrl",
        "label": "Calendar ICS URL",
        "type": "url",
        "placeholder": "https://calendar.google.com/calendar/ical/.../basic.ics",
        "helpText": "Optional. Leave empty to auto-detect from your signed-in Google Calendar session."
      },
      {
        "key": "maxResults",
        "label": "Upcoming event count",
        "type": "number",
        "min": 1,
        "max": 30,
        "step": 1
      },
      {
        "key": "daysAhead",
        "label": "Look ahead (days)",
        "type": "number",
        "min": 1,
        "max": 90,
        "step": 1
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 240,
        "step": 1
      },
      {
        "key": "viewMode",
        "label": "Calendar view",
        "type": "select",
        "options": [
          {
            "value": "month",
            "label": "Monthly"
          },
          {
            "value": "week",
            "label": "Weekly"
          }
        ]
      },
      {
        "key": "weekStartsOn",
        "label": "Week starts on",
        "type": "select",
        "options": [
          {
            "value": "monday",
            "label": "Monday"
          },
          {
            "value": "sunday",
            "label": "Sunday"
          }
        ]
      },
      {
        "key": "showLocation",
        "label": "Show location",
        "type": "checkbox"
      },
      {
        "key": "openInNewTab",
        "label": "Open event in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "mondayAssigned",
    "title": "Monday Assigned Issues",
    "defaultConfig": {
      "connectorUrl": "http://localhost:8787/api/auth/start",
      "accessToken": "",
      "boardId": "",
      "peopleColumnId": "",
      "maxItems": 15,
      "workStartHour": 9,
      "workEndHour": 18,
      "openInNewTab": true,
      "autoRefreshDayKey": "",
      "autoRefreshSlotsDone": "",
      "cacheBoardId": 0,
      "cacheAt": 0,
      "cacheBoardName": "",
      "cacheAssigneeName": "",
      "cacheGroups": [],
      "cacheIssues": [],
      "cacheBoards": []
    },
    "defaultLayout": {
      "x": 1080,
      "y": 520,
      "w": 520,
      "h": 360
    },
    "settingsSchema": [
      {
        "key": "connectorUrl",
        "label": "Auth connector URL",
        "type": "url",
        "placeholder": "https://your-backend.example.com/api/monday/oauth/start",
        "helpText": "Backend OAuth start endpoint. It must return to this extension with access_token."
      },
      {
        "key": "boardId",
        "label": "Board ID(s)",
        "type": "text",
        "placeholder": "123456789 or 123456789,987654321",
        "helpText": "Use numeric board IDs from /boards/<id>. Comma-separated IDs are supported."
      },
      {
        "key": "peopleColumnId",
        "label": "People column ID(s)",
        "type": "text",
        "placeholder": "person or person,owner,*",
        "helpText": "Comma-separated selectors follow board index order. Each selector can be column ID/title, and * shows all tasks in that board."
      },
      {
        "key": "maxItems",
        "label": "Items to show",
        "type": "number",
        "min": 1,
        "max": 120,
        "step": 1
      },
      {
        "key": "workStartHour",
        "label": "Work start hour",
        "type": "number",
        "min": 0,
        "max": 23,
        "step": 1,
        "helpText": "Auto refresh runs 3 times between start/end hours"
      },
      {
        "key": "workEndHour",
        "label": "Work end hour",
        "type": "number",
        "min": 1,
        "max": 24,
        "step": 1
      },
      {
        "key": "openInNewTab",
        "label": "Open issue in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "mondayMeetingNote",
    "title": "Monday Meeting Note",
    "defaultConfig": {
      "connectorUrl": "http://localhost:8787/api/auth/start",
      "accessToken": "",
      "boardId": "",
      "meetingNoteColumnId": "미팅 노트, monday Doc",
      "openInNewTab": true,
      "autoRefreshDayKey": "",
      "autoRefreshSlotsDone": "",
      "cacheBoardId": 0,
      "cacheMeetingNoteColumnId": "",
      "cacheAt": 0,
      "cacheBoardName": "",
      "cacheLatest": null,
      "cacheBoards": []
    },
    "defaultLayout": {
      "x": 1100,
      "y": 140,
      "w": 320,
      "h": 360
    },
    "settingsSchema": [
      {
        "key": "connectorUrl",
        "label": "Auth connector URL",
        "type": "url",
        "placeholder": "https://your-backend.example.com/api/monday/oauth/start",
        "helpText": "Backend OAuth start endpoint. It must return to this extension with access_token."
      },
      {
        "key": "boardId",
        "label": "Board ID(s)",
        "type": "text",
        "placeholder": "123456789 or 123456789,987654321",
        "helpText": "Use numeric board IDs from /boards/<id>. Comma-separated IDs are supported."
      },
      {
        "key": "meetingNoteColumnId",
        "label": "Meeting note column selector(s)",
        "type": "text",
        "placeholder": "미팅 노트, monday Doc",
        "helpText": "Column ID/title selectors for note/doc lookup. Comma-separated selectors are supported."
      },
      {
        "key": "openInNewTab",
        "label": "Open links in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 1,
      "h": 2
    }
  },
  {
    "type": "githubPrList",
    "title": "GitHub PRs",
    "defaultConfig": {
      "repository": "",
      "accessToken": "",
      "maxItems": 20,
      "refreshMinutes": 10,
      "openInNewTab": true,
      "showBranchInfo": true,
      "showReviewerInfo": true,
      "cacheRepository": "",
      "cacheTokenFingerprint": "",
      "cacheAt": 0,
      "cachePullItems": []
    },
    "defaultLayout": {
      "x": 560,
      "y": 560,
      "w": 540,
      "h": 340
    },
    "settingsSchema": [
      {
        "key": "repository",
        "label": "Repository",
        "type": "text",
        "placeholder": "owner/repo",
        "helpText": "Enter owner/repo or a full GitHub repository URL."
      },
      {
        "key": "accessToken",
        "label": "Access token (optional)",
        "type": "password",
        "placeholder": "GitHub token",
        "helpText": "Needed for private repos and higher API limits."
      },
      {
        "key": "maxItems",
        "label": "PRs to show",
        "type": "number",
        "min": 1,
        "max": 50,
        "step": 1
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 120,
        "step": 1
      },
      {
        "key": "showBranchInfo",
        "label": "Show branch refs",
        "type": "checkbox"
      },
      {
        "key": "showReviewerInfo",
        "label": "Show requested reviewers",
        "type": "checkbox"
      },
      {
        "key": "openInNewTab",
        "label": "Open links in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "flexWorktime",
    "title": "Flex Worktime",
    "defaultConfig": {
      "flexHomeUrl": "https://flex.team/home",
      "openFlexTabIfMissing": true,
      "refreshMinutes": 15,
      "detailUrlTemplate": "",
      "openInNewTab": true
    },
    "defaultLayout": {
      "x": 660,
      "y": 220,
      "w": 300,
      "h": 150
    },
    "settingsSchema": [
      {
        "key": "flexHomeUrl",
        "label": "Flex Home URL",
        "type": "text",
        "placeholder": "https://flex.team/home",
        "helpText": "Reads the visible summary text from your logged-in flex.team/home tab."
      },
      {
        "key": "openFlexTabIfMissing",
        "label": "Open Flex tab if missing",
        "type": "checkbox",
        "helpText": "If enabled, the widget opens Flex Home in a background tab, scrapes, then closes it."
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 720,
        "step": 1
      },
      {
        "key": "detailUrlTemplate",
        "label": "Detail URL template (optional)",
        "type": "text",
        "placeholder": "https://example.com/worktime?date={date}&id={id}"
      },
      {
        "key": "openInNewTab",
        "label": "Open detail in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 1
    }
  },
  {
    "type": "flexWorktimeTimeline",
    "title": "Flex Worktime History",
    "defaultConfig": {
      "flexHomeUrl": "https://flex.team/home",
      "openFlexTabIfMissing": true,
      "dateMode": "today",
      "customDate": "",
      "refreshMinutes": 15,
      "detailUrlTemplate": "",
      "openInNewTab": true
    },
    "defaultLayout": {
      "x": 660,
      "y": 220,
      "w": 300,
      "h": 220
    },
    "settingsSchema": [
      {
        "key": "flexHomeUrl",
        "label": "Flex URL",
        "type": "text",
        "placeholder": "https://flex.team/home",
        "helpText": "Reads the daily history from flex.team/time-tracking/my-work-record. /home and /time-tracking/my-work-record are both accepted."
      },
      {
        "key": "openFlexTabIfMissing",
        "label": "Open Flex tab if missing",
        "type": "checkbox",
        "helpText": "If enabled, the widget opens and reuses a background Flex Work Record tab for history scraping."
      },
      {
        "key": "dateMode",
        "label": "Date mode",
        "type": "select",
        "options": [
          {
            "value": "today",
            "label": "Today"
          },
          {
            "value": "yesterday",
            "label": "Yesterday"
          },
          {
            "value": "tomorrow",
            "label": "Tomorrow"
          },
          {
            "value": "custom",
            "label": "Custom"
          }
        ],
        "helpText": "Choose which day to read from my-work-record."
      },
      {
        "key": "customDate",
        "label": "Custom date",
        "type": "text",
        "placeholder": "YYYY-MM-DD",
        "helpText": "Used when Date mode is set to Custom."
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 720,
        "step": 1
      },
      {
        "key": "detailUrlTemplate",
        "label": "Detail URL template (optional)",
        "type": "text",
        "placeholder": "https://example.com/worktime?date={date}&id={id}"
      },
      {
        "key": "openInNewTab",
        "label": "Open detail in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "githubReviewInbox",
    "title": "GitHub Review Inbox",
    "defaultConfig": {
      "repository": "",
      "githubLogin": "",
      "accessToken": "",
      "maxItems": 20,
      "refreshMinutes": 15,
      "agingWarnDays": 3,
      "agingDangerDays": 5,
      "openInNewTab": true,
      "cacheRepository": "",
      "cacheGithubLogin": "",
      "cacheTokenFingerprint": "",
      "cacheAt": 0,
      "cacheTokenUserWarning": "",
      "cacheReviewItems": []
    },
    "defaultLayout": {
      "x": 720,
      "y": 560,
      "w": 540,
      "h": 360
    },
    "settingsSchema": [
      {
        "key": "repository",
        "label": "Repository URL",
        "type": "text",
        "placeholder": "https://github.com/owner/repo",
        "helpText": "Enter owner/repo or a full GitHub repository URL."
      },
      {
        "key": "githubLogin",
        "label": "GitHub login",
        "type": "text",
        "placeholder": "your-github-id",
        "helpText": "The GitHub user whose review queue should be evaluated."
      },
      {
        "key": "accessToken",
        "label": "PAT / token",
        "type": "password",
        "placeholder": "GitHub personal access token",
        "helpText": "Recommended first. Needed for private repos and more reliable API access."
      },
      {
        "key": "maxItems",
        "label": "PRs to show",
        "type": "number",
        "min": 1,
        "max": 50,
        "step": 1
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 1,
        "max": 120,
        "step": 1
      },
      {
        "key": "agingWarnDays",
        "label": "Warn after (days)",
        "type": "number",
        "min": 1,
        "max": 90,
        "step": 1
      },
      {
        "key": "agingDangerDays",
        "label": "Danger after (days)",
        "type": "number",
        "min": 2,
        "max": 90,
        "step": 1
      },
      {
        "key": "openInNewTab",
        "label": "Open links in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  },
  {
    "type": "weather",
    "title": "Weather",
    "defaultConfig": {
      "locationQuery": "Seoul",
      "temperatureUnit": "celsius",
      "detailMode": "simple",
      "refreshMinutes": 30
    },
    "defaultLayout": {
      "x": 180,
      "y": 180,
      "w": 360,
      "h": 220
    },
    "settingsSchema": [
      {
        "key": "locationQuery",
        "label": "Location",
        "type": "text",
        "placeholder": "Seoul",
        "helpText": "City name used for weather lookup."
      },
      {
        "key": "temperatureUnit",
        "label": "Temperature unit",
        "type": "select",
        "options": [
          {
            "value": "celsius",
            "label": "Celsius (°C)"
          },
          {
            "value": "fahrenheit",
            "label": "Fahrenheit (°F)"
          }
        ]
      },
      {
        "key": "detailMode",
        "label": "Layout",
        "type": "select",
        "options": [
          {
            "value": "simple",
            "label": "Simple (height 1)"
          },
          {
            "value": "advanced",
            "label": "Advanced (height 2)"
          }
        ],
        "helpText": "Advanced shows Feels like, Humidity, and Wind details."
      },
      {
        "key": "refreshMinutes",
        "label": "Refresh every (minutes)",
        "type": "number",
        "min": 5,
        "max": 240,
        "step": 1
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 1
    }
  },
  {
    "type": "container",
    "title": "Widget Folder",
    "defaultConfig": {
      "expanded": false,
      "expandedCols": 4,
      "expandedRows": 3,
      "icon": "",
      "useGlobalIconSize": true,
      "iconSizePercent": 100
    },
    "defaultLayout": {
      "x": 240,
      "y": 140,
      "w": 120,
      "h": 120
    },
    "settingsSchema": [
      {
        "key": "icon",
        "label": "Folder icon (emoji or image URL)",
        "type": "text",
        "placeholder": "📁 or https://example.com/icon.png"
      },
      {
        "key": "iconEditor",
        "label": "Icon editor",
        "type": "shortcut-icon-editor",
        "helpText": "Draw or import an image and apply it as folder icon."
      },
      {
        "key": "useGlobalIconSize",
        "label": "Use global icon size",
        "type": "checkbox"
      },
      {
        "key": "iconSizePercent",
        "label": "Icon size (%)",
        "type": "number",
        "min": 40,
        "max": 220,
        "step": 5
      },
      {
        "key": "expandedCols",
        "label": "Expanded columns",
        "type": "number",
        "min": 1,
        "max": 16,
        "step": 1
      },
      {
        "key": "expandedRows",
        "label": "Expanded rows",
        "type": "number",
        "min": 1,
        "max": 16,
        "step": 1
      }
    ],
    "defaultGridSize": {
      "w": 1,
      "h": 1
    }
  },
  {
    "type": "codexUsage",
    "title": "Codex Usage",
    "defaultConfig": {
      "openInNewTab": true
    },
    "defaultLayout": {
      "x": 420,
      "y": 260,
      "w": 380,
      "h": 280
    },
    "settingsSchema": [
      {
        "key": "openInNewTab",
        "label": "Open usage page in new tab",
        "type": "checkbox"
      }
    ],
    "defaultGridSize": {
      "w": 2,
      "h": 2
    }
  }
];
