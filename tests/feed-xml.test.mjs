import test from "node:test";
import assert from "node:assert/strict";

import { readAtomAlternateLink, readFeedNodeText } from "../widgets/shared/feedXml.js";

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
