// Minimal fake DOM for view/runtime tests (the repo tests avoid a real DOM dependency).

export class FakeEl {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.className = "";
    this.textContent = "";
    this.disabled = false;
    this.value = "";
    this.classList = {
      add: (name) => {
        if (!this.className.split(" ").includes(name)) {
          this.className = `${this.className} ${name}`.trim();
        }
      },
      toggle: (name, force) => {
        const has = this.className.split(" ").includes(name);
        const on = force === undefined ? !has : Boolean(force);
        if (on && !has) {
          this.className = `${this.className} ${name}`.trim();
        } else if (!on && has) {
          this.className = this.className.split(" ").filter((part) => part !== name).join(" ");
        }
        return on;
      }
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }

  replaceWith(next) {
    if (!this.parent) {
      return;
    }
    const parent = this.parent;
    const index = parent.children.indexOf(this);
    parent.children[index] = next;
    next.parent = parent;
    this.parent = null;
  }

  click() {
    for (const handler of this.listeners.click || []) {
      handler({ preventDefault() {} });
    }
  }

  submit() {
    for (const handler of this.listeners.submit || []) {
      handler({ preventDefault() {} });
    }
  }
}

export class FakeDocument {
  constructor() {
    this.body = new FakeEl("body", this);
    this.listeners = {};
    this.visibilityState = "visible";
  }

  createElement(tag) {
    return new FakeEl(tag, this);
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter((entry) => entry !== handler);
  }

  fire(type) {
    for (const handler of this.listeners[type] || []) {
      handler({});
    }
  }
}

export function walk(root, visit) {
  visit(root);
  for (const child of root.children) {
    walk(child, visit);
  }
}

export function findAll(root, predicate) {
  const out = [];
  walk(root, (node) => {
    if (predicate(node)) {
      out.push(node);
    }
  });
  return out;
}

export function textOf(root) {
  const parts = [];
  walk(root, (node) => {
    if (node.textContent) {
      parts.push(node.textContent);
    }
  });
  return parts.join(" | ");
}

export function buttonByText(root, text) {
  return findAll(root, (node) => node.tagName === "BUTTON" && node.textContent === text)[0];
}
