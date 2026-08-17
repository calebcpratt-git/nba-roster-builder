# design-sync notes — Association GM UI

Not a published design-system package — `components/ui/` is shadcn/ui
primitives consumed directly by the Next.js app (no `dist/`, no Storybook).
Synced via the package shape's synth-entry mode, scoped to `components/ui`
only (business components under `components/*.tsx` are out of scope).

## Repo-specific setup

- **PKG_DIR resolution**: there's no installed npm package to point
  `--node-modules`/`cfg.pkg` at, so a self-referential symlink makes it work:
  `node_modules/association-gm-ui -> ..` (repo root). This lets `PKG_DIR`
  resolve to the repo root (so `cfg.srcDir`/`cfg.tsconfig`/`cfg.cssEntry`
  resolve correctly) while `--node-modules ./node_modules` still resolves the
  real installed deps (`@radix-ui/*`, `lucide-react`, etc.) esbuild needs to
  bundle the synth entry. **Not committed** (node_modules is gitignored) — recreate
  on a fresh clone/re-sync: `ln -sfn .. node_modules/association-gm-ui`.
- **No compiled CSS exists in the repo.** `app/globals.css` only has
  `@import 'tailwindcss'` + CSS custom-property tokens; the actual utility
  classes are generated at build time. `cfg.buildCmd` runs the Tailwind v4
  CLI to produce `.ds-sync/compiled-tailwind.css`, which `cfg.cssEntry`
  points at. **Always run `cfg.buildCmd` before `package-build.mjs`** — a
  stale or missing `.ds-sync/compiled-tailwind.css` will hard-fail
  `[CSS_IMPORT_MISSING]` (the raw globals.css still has unresolved
  `@import 'tailwindcss'`/`'tw-animate-css'` specifiers).
- **Fonts**: the app loads Geist/Geist Mono via `next/font/google`, which only
  materializes local font files inside a real `next build` (we don't run
  one). `.design-sync/assets/geist/{fonts.css,*.woff2}` ships the same font
  bytes instead, sourced from the official `geist` npm package (Vercel, SIL
  OFL) via `cfg.extraFonts`. Committed durably (not regenerated per sync).
- **`Toaster` name collision**: both `components/ui/toaster.tsx` (Radix Toast)
  and `components/ui/sonner.tsx` (sonner) export a component named `Toaster`.
  Neither is imported anywhere in the app. The synth entry's `export * from`
  over every src file makes this an ESM ambiguous-star-export — the runtime
  binding resolves to `undefined`. Excluded via
  `componentSrcMap: {"Toaster": null}`. This is dead code in the source repo,
  not a design-sync issue — flagged separately for cleanup (spawned task, not
  yet resolved as of this sync).

## Accepted, non-blocking warnings

- `[FONT_MISSING]` for **"Geist Fallback" / "Geist Mono Fallback"**: these are
  synthetic per-build metric-override aliases `next/font` generates pointing
  at a *local* system font tuned to Geist's metrics (anti-FOUT), not a
  distinct shippable font file. No real bytes exist to source. Harmless —
  the stack falls through to "Geist" (now shipped) and would only reach this
  second name if that failed, then continues to the system default anyway.
- **Known render warns** (floor-card / thin renders — `bad: true` in
  `.render-check.json`, `fallbackCard: false`): these are real component
  renders with the `.d.ts` crash-prevention default props, which supply no
  children/text — genuinely near-empty output (an empty `Badge` pill, an
  unchecked `Checkbox`, a padded-but-childless `CardHeader`), not a bug.
  Confirmed via `.render-check.json` (`texts: [""]`, `errs: 0`,
  `rootEmpty: false`) — the component mounts fine, it's just contentless.
  The fix is authoring a composed preview (§4.2). Resolved this run for the
  core-20 authored set. Final count after authoring: 42 bad, all deferred to
  a future re-sync's incremental authoring: `AlertTitle`, `Avatar`,
  `BreadcrumbEllipsis`, `BreadcrumbItem`, `BreadcrumbSeparator`,
  `ButtonGroupText`, `CardHeader`, `ContextMenuLabel`, `DrawerFooter`,
  `DrawerHeader`, `DropdownMenuLabel`, `Empty`, `FieldSeparator`,
  `InputGroupAddon`, `InputGroupButton`, `InputGroupInput`,
  `InputGroupTextarea`, `InputOTPSeparator`, `Item`, `Kbd`, `KbdGroup`,
  `MenubarLabel`, `NavigationMenuItem`, `PaginationEllipsis`,
  `PaginationItem`, `PaginationLink`, `Progress`, `SheetFooter`,
  `SheetHeader`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`,
  `SidebarHeader`, `SidebarMenuItem`, `SidebarMenuSkeleton`, `SidebarMenuSub`,
  `SidebarMenuSubButton`, `SidebarMenuSubItem`, `SidebarProvider`,
  `TableCaption`, `TableCell`, `TableHead`. These are **not pushed** — they
  stay unsynced to the project until authored (`AspectRatio` and `Spinner`
  cleared on their own between builds — floor-card default-prop luck, not a
  fix; don't be surprised if they wobble again on a future re-sync).
- **`[GRID_OVERFLOW]` on `Toast`**: the authored preview tried to defeat
  Radix's `fixed` positioning with `className="static translate-x-0"` /
  `ToastViewport className="static"`, but it still escaped its grid cell in
  the contact-sheet view. Fixed with `cfg.overrides.Toast: {"cardMode":
  "single", "primaryStory": "TradeAccepted"}` — presentation-only, no
  regrade needed (confirmed: full `package-capture.mjs` re-run shows Toast
  `carried forward`).
- `tokens: 265 defined, 145 referenced (2 missing, below threshold)` — fine,
  not flagged as `[TOKENS_MISSING]`.

## Preview authoring scope (this run)

User-selected "core 20" — the `components/ui` files actually imported
somewhere in the app (by real usage count via
`grep -rhoE "from ['"]@/components/ui/[a-z-]+['"]" app components hooks`):
`button`, `input`, `card`, `dialog`, `select`, `label`, `popover`, `badge`,
`separator`, `tooltip`, `toast`, `switch`, `textarea`, `sheet`, `hover-card`,
`toggle`, `skeleton`, `checkbox`, `calendar`, `alert-dialog`. The other 37
files ship fully functional (bundled + typed) with floor cards; authorable
incrementally on any future re-sync.

## Re-sync risks

- `.ds-sync/compiled-tailwind.css` scans the **whole repo** for Tailwind
  utility classes (no `@source` restriction in `globals.css`), not just
  `components/ui/`. This is actually a good fidelity match to what `next
  build` would produce, but means the shipped CSS is larger than the
  UI-primitives-only surface, and picks up incidental classes from business
  components too. Not wrong, just worth knowing if the CSS size looks
  surprising on a future diff.
- The `node_modules/association-gm-ui` self-symlink is NOT committed
  (node_modules is gitignored) — must be recreated after every fresh clone
  before re-running the build (see above).
- The Toaster dead-code cleanup (see above) may land from the spawned task
  before the next sync — if `toaster.tsx`/`sonner.tsx` change or one is
  deleted, remove the `componentSrcMap: {"Toaster": null}` override and
  re-check whether the collision is actually resolved.
- Font sourcing (`.design-sync/assets/geist/`) is pinned to `geist@1.7.2` at
  the time of this sync — if the app's actual Geist version drifts far from
  that, the shipped glyphs could diverge slightly from what `next/font`
  would self-host. Low risk (variable font, same upstream family).
