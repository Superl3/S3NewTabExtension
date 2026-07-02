import { normalizeText } from "../../core/utils/text.js";

export function parseFeedXmlDocument(xmlText, parseErrorMessage) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(xmlText || ""), "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(parseErrorMessage);
  }
  return doc;
}

export function readFeedNodeText(parent, tagNames = []) {
  if (!parent) {
    return "";
  }

  for (const tagName of tagNames) {
    const nodes = parent.getElementsByTagName(tagName);
    if (!nodes.length) {
      continue;
    }
    const text = normalizeText(nodes[0]?.textContent);
    if (text) {
      return text;
    }
  }

  return "";
}

export function readAtomAlternateLink(entry) {
  const links = Array.from(entry?.getElementsByTagName("link") || []);
  let fallback = "";

  for (const linkNode of links) {
    const href = normalizeText(linkNode.getAttribute("href"));
    if (!href) {
      continue;
    }
    if (!fallback) {
      fallback = href;
    }
    const rel = normalizeText(linkNode.getAttribute("rel")).toLowerCase();
    if (!rel || rel === "alternate") {
      return href;
    }
  }

  return fallback;
}
