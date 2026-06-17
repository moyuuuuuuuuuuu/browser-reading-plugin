# Catalog Sidebar Design

## Goal

Move the complete chapter catalog into a fixed left-side panel and move previous/next navigation into a fixed right-side panel while reading enhancement is enabled.

## Scope

- Keep the extension as a plain Manifest V3 browser plugin with no build step.
- Continue detecting previous chapter, table of contents, and next chapter links from the current page.
- Use the detected table-of-contents URL to request and parse the catalog page.
- Render a left-side catalog panel with chapter count and a scrollable chapter list.
- Render a right-side control panel with only previous chapter and next chapter actions.
- Keep missing previous/next links visible but disabled.
- If the catalog request or parsing fails, render a left-side fallback state and keep an "open catalog" link when available.

## Non-Goals

- Do not move original site DOM nodes.
- Do not add per-site selector configuration.
- Do not inject scripts into the catalog page.
- Do not request pages outside the normal page context; the content script should use browser `fetch`.

## Catalog Fetching

When reading enhancement is enabled:

1. Detect current page targets.
2. Render the right-side previous/next controls immediately.
3. Render the left catalog panel in a loading state if a catalog URL exists.
4. Fetch the catalog URL with `credentials: "include"` so same-site authenticated pages can work.
5. Parse the returned HTML with `DOMParser`.
6. Extract likely chapter links from the parsed document.
7. Replace the loading state with a catalog list or a fallback message.

The helper should ignore stale fetch results if the user disables reading mode or settings reapply before the request completes.

## Catalog Parsing

The parser scans `a[href]` from the catalog document, normalizes title text, resolves each URL against the catalog URL, and keeps likely chapter links. A likely chapter link has either:

- a chapter-like label such as `第1章`, `第十二章`, `Chapter 3`, or `12. Title`; or
- a URL containing common chapter markers such as `chapter`, `read`, or numeric html paths, with a non-empty title.

Links are deduplicated by absolute URL while preserving order. Navigation links such as previous, next, login, home, catalog, and search are excluded.

## Layout

- Left panel: `.brp-catalog-panel`, fixed and vertically centered. It contains a header (`目录 · N章`) and a scrollable list.
- Right panel: `.brp-chapter-nav`, fixed and vertically centered. It contains only previous and next controls.
- Narrow screens keep both panels compact at viewport edges.

## Testing

Use Node only for local test execution. Tests should cover:

- catalog parser extracts and deduplicates likely chapter links;
- parser excludes navigation and non-chapter links;
- right navigation renders only previous/next;
- catalog fallback renders when fetch fails;
- disabled reading mode removes both panels.
