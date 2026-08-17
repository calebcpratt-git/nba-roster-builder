## Conventions

This is the **Association GM UI kit** — the shadcn/ui primitives that back
"Association GM," an NBA roster/cap-sheet builder. Every component is a
plain React function; there is no root provider to wrap the app in — Tailwind
utility classes read CSS custom-property tokens directly, so a component
renders correctly the moment it's mounted.

**Dark mode**: put `class="dark"` on any ancestor element (`<html>`,
`<body>`, or a local wrapper) to flip the palette — every token has a dark
value gated by `@custom-variant dark (&:is(.dark *))`. No provider or script
needed; it's a plain CSS class toggle.

**Styling idiom**: Tailwind v4 utility classes, never inline styles or
CSS-in-JS. Colors are never literal (`bg-green-600`) — always the semantic
token classes below, so a design stays correct if the brand palette changes:

| Class | Token | Use for |
|---|---|---|
| `bg-background` / `text-foreground` | `--background` / `--foreground` | page canvas |
| `bg-card` / `text-card-foreground` | `--card` | card/panel surfaces |
| `bg-popover` / `text-popover-foreground` | `--popover` | dropdowns, dialogs, tooltips content |
| `bg-primary` / `text-primary-foreground` | `--primary` | primary actions (this DS's brand green) |
| `bg-secondary` / `text-secondary-foreground` | `--secondary` | secondary actions |
| `bg-muted` / `text-muted-foreground` | `--muted` | de-emphasized text, subtle fills |
| `bg-accent` / `text-accent-foreground` | `--accent` | hover/active states |
| `bg-destructive` / `text-destructive-foreground`(`text-white`) | `--destructive` | delete/release/danger actions |
| `border-border` / `border-input` | `--border` / `--input` | borders, form-field outlines |
| `ring-ring` | `--ring` | focus rings |
| `rounded-sm/md/lg/xl` | `--radius-*` (derived from `--radius`) | corner radius, already themed — don't hardcode `rounded-[Npx]` |

Spacing, layout, and typography are standard Tailwind utilities
(`flex`, `gap-2`, `px-4`, `text-sm`, `font-medium`, etc.) — nothing custom
there. Font families are `font-sans` (Geist) and `font-mono` (Geist Mono),
both wired to `--font-sans`/`--font-mono`.

**Compound components compose, they don't stand alone.** Most multi-part
primitives (`Dialog`, `Select`, `Card`, `Sheet`, `Popover`, `Tooltip`,
`AlertDialog`, `HoverCard`, `Toast`) export a root plus several named parts
(`*Trigger`, `*Content`, `*Header`, `*Title`, `*Footer`, …) — always compose
the full family together, the way the graded previews do, rather than using
a sub-part in isolation. Overlay components (`Dialog`, `Sheet`, `Popover`,
`Select`, `Tooltip`, `HoverCard`, `AlertDialog`) need `defaultOpen` (or
controlled `open`) to render their content in a static context — Radix
portals render nothing when closed.

**Where the truth lives**: `styles.css` (imports `_ds_bundle.css`, the real
compiled Tailwind output, plus `fonts/fonts.css`) is the complete stylesheet
— read it before inventing a utility class that isn't in the table above.
Each component's `.prompt.md` documents its actual props from the shipped
`.d.ts`.

**Idiomatic build snippet** (adapted from the graded `Card` preview):

```tsx
<Card className="w-[360px]">
  <CardHeader className="border-b">
    <CardTitle>Jaylen Brown</CardTitle>
    <CardDescription>Boston Celtics · SF/SG · Bird rights</CardDescription>
    <CardAction>
      <Badge variant="secondary">4 yrs left</Badge>
    </CardAction>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">
      2026-27 cap hit is $49.2M, part of a supermax extension.
    </p>
  </CardContent>
  <CardFooter className="gap-2">
    <Button size="sm" variant="outline">View Contract</Button>
    <Button size="sm">Explore Trades</Button>
  </CardFooter>
</Card>
```
