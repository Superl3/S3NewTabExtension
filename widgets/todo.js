function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export const todoWidget = {
  type: "todo",
  title: "TODO",
  defaultConfig: {
    items: []
  },
  defaultLayout: {
    x: 40,
    y: 240,
    w: 370,
    h: 290
  },
  settingsSchema: [],
  create({ container, getConfig, patchConfig }) {
    const form = document.createElement("form");
    const input = document.createElement("input");
    const addBtn = document.createElement("button");
    const list = document.createElement("ul");

    form.className = "search-form";
    list.className = "todo-list";

    input.type = "text";
    input.placeholder = "Add a task";
    addBtn.type = "submit";
    addBtn.className = "btn";
    addBtn.textContent = "Add";

    form.append(input, addBtn);
    container.append(form, list);

    function saveItems(items) {
      patchConfig({ items });
    }

    function render() {
      const cfg = getConfig();
      const items = Array.isArray(cfg.items) ? cfg.items : [];
      list.replaceChildren();

      for (const item of items) {
        const li = document.createElement("li");
        li.className = "todo-item";
        if (item.done) {
          li.classList.add("done");
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(item.done);
        checkbox.setAttribute("aria-label", "Mark task done");

        const text = document.createElement("span");
        text.className = "todo-text";
        text.textContent = item.text;

        const title = document.createElement("label");
        title.className = "todo-item-title";
        title.append(checkbox, text);

        const del = document.createElement("button");
        del.className = "todo-delete-btn";
        del.type = "button";
        del.textContent = "×";
        del.setAttribute("aria-label", "Delete task");

        const actions = document.createElement("div");
        actions.className = "todo-item-actions";
        actions.append(del);

        const top = document.createElement("div");
        top.className = "todo-item-top";
        top.append(title, actions);

        const meta = document.createElement("p");
        meta.className = "todo-item-meta";
        meta.textContent = item.done ? "Completed task" : "Pending task";

        const badges = document.createElement("div");
        badges.className = "todo-item-badges";

        const statusBadge = document.createElement("span");
        statusBadge.className = `todo-item-badge ${item.done ? "is-done" : "is-pending"}`;
        statusBadge.textContent = item.done ? "Done" : "To do";
        badges.append(statusBadge);

        checkbox.addEventListener("change", () => {
          const next = items.map((entry) => {
            if (entry.id !== item.id) {
              return entry;
            }
            return { ...entry, done: checkbox.checked };
          });
          saveItems(next);
        });

        del.addEventListener("click", () => {
          const next = items.filter((entry) => entry.id !== item.id);
          saveItems(next);
        });

        li.append(top, meta, badges);
        list.append(li);
      }
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        return;
      }
      const cfg = getConfig();
      const items = Array.isArray(cfg.items) ? cfg.items : [];
      saveItems([...items, { id: uid(), text, done: false }]);
      input.value = "";
      input.focus();
    });

    render();

    return {
      refresh: render
    };
  }
};
