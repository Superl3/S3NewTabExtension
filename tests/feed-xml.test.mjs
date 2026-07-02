import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFeedXmlDocument,
  readAtomAlternateLink,
  readFeedNodeText
} from "../widgets/shared/feedXml.js";

function createTextNode(textContent) {
  return { textContent };
}

function createParent(children = {}) {
  return {
    getElementsByTagName(tagName) {
      return children[tagName] || [];
    }
  };
}

function createLink({ href = "", rel = "" } = {}) {
  return {
    getAttribute(name) {
      if (name === "href") {
        return href;
      }
      if (name === "rel") {
        return rel;
      }
      return "";
    }
  };
}

test("feed XML helpers read the first non-empty node text", () => {
  const parent = createParent({
    title: [createTextNode("  ")],
    summary: [createTextNode("  Hello feed  ")]
  });

  assert.equal(readFeedNodeText(parent, ["title", "summary"]), "Hello feed");
  assert.equal(readFeedNodeText(parent, ["missing"]), "");
  assert.equal(readFeedNodeText(null, ["title"]), "");
});

test("feed XML helpers prefer alternate Atom links with fallback", () => {
  const entry = createParent({
    link: [
      createLink({ href: "https://example.com/enclosure", rel: "enclosure" }),
      createLink({ href: "https://example.com/post", rel: "alternate" })
    ]
  });
  const fallbackOnly = createParent({
    link: [createLink({ href: "https://example.com/feed", rel: "self" })]
  });

  assert.equal(readAtomAlternateLink(entry), "https://example.com/post");
  assert.equal(readAtomAlternateLink(fallbackOnly), "https://example.com/feed");
  assert.equal(readAtomAlternateLink(null), "");
});

test("feed XML document parser normalizes text and reports parser errors", () => {
  const previousDomParser = globalThis.DOMParser;
  let receivedText = "";
  let receivedType = "";

  globalThis.DOMParser = class FakeDomParser {
    parseFromString(text, type) {
      receivedText = text;
      receivedType = type;
      return {
        querySelector(selector) {
          return text.includes("<broken") && selector === "parsererror" ? {} : null;
        }
      };
    }
  };

  try {
    const doc = parseFeedXmlDocument(null, "bad xml");
    assert.equal(receivedText, "");
    assert.equal(receivedType, "application/xml");
    assert.equal(typeof doc.querySelector, "function");
    assert.throws(() => parseFeedXmlDocument("<broken", "bad xml"), /bad xml/);
  } finally {
    if (typeof previousDomParser === "undefined") {
      delete globalThis.DOMParser;
    } else {
      globalThis.DOMParser = previousDomParser;
    }
  }
});
