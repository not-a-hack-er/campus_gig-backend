// ============================================================
// utils/helpers.js — Shared Helper Functions
//
// Small utility functions reused across the codebase.
// ============================================================

// Convert a text string into a URL-friendly slug
// Example: "Web Development" → "web-development"
const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-"); // Replace spaces with hyphens
};

// ─── Regex Sanitizer (ReDoS Prevention) ──────────────────────────────────────
//
// SECURITY: Never pass raw user input directly into new RegExp().
// An attacker can craft inputs like "((a+)+)+$" that cause catastrophic
// backtracking in the V8 regex engine, freezing Node.js's event loop.
//
// This function escapes all special regex metacharacters so the string
// is treated as a literal search term.
//
// Example:
//   escapeRegex("foo.bar(baz)")  →  "foo\\.bar\\(baz\\)"
//   new RegExp(escapeRegex(userInput), "i")  — safe to use
//
const escapeRegex = (str) => {
  if (typeof str !== "string") return "";
  // Escape all characters that have special meaning in a regex
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

module.exports = { generateSlug, escapeRegex };