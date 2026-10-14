import "server-only";
import sanitizeHtml from "sanitize-html";

/** Sanitize third-party job HTML before rendering (sources require it; never trust feed HTML). */
export function sanitizeJobHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "h4", "h5", "blockquote", "a", "span", "div", "table", "thead", "tbody", "tr", "td", "th", "hr"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener noreferrer ugc", target: "_blank" }),
      h1: "h3", h2: "h3",
    },
    exclusiveFilter: (frame) => ["p", "span", "div"].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren?.length,
  });
}
