# Vibe brand

Derived from neon.com. Vibe is a reference app for the Neon Agent Program;
it must look like it shipped from the same shop as neon.com and ui.neon.com.
Tokens are canonical in `packages/ui/src/styles/tokens.css` (neon ui
registry); this doc says how to use them, not what they are.

## Source

- neon.com: near-black surfaces, one phosphor green, flat geometry, Inter,
  mono strictly for code and data, generous dark whitespace.
- ui.neon.com (neon ui): the component vocabulary. If a surface can be built
  from registry components, it must be.

## Palette

- Base: `--background` #0c0d0d (dark is the product default; light tokens
  exist for docs/marketing embeds only).
- Accent: `--primary` #00E599. ONE green moment per screen: the primary
  action or the live status, never both, never decoration.
- Grays carry everything else. Borders are hairline `--border`; surfaces
  step by one tint, never by shadows.
- `--destructive` only for irreversible actions (delete app, delete account).

## Geometry & type

- Radius 0.25rem everywhere (slight, uniform). One radius system, no per-component exceptions.
- Inter for all UI. Display: tight tracking (-0.02 to -0.035em), weight 600-700.
- Mono (JetBrains Mono) ONLY for: project/branch ids, git shas, connection
  strings, metrics, code. Never for labels, buttons, nav, or eyebrows.
- No wide-tracked uppercase strips. No emoji in product copy.

## Motion

Registry keyframes only (shimmer, status-breathe, typewriter, grain
resolve), composed at exactly three moments:

1. Provisioning (agent is building infrastructure)
2. Checkpoint create/restore
3. Upgrade (org transfer)
   Everything else is static or a 150ms color/border transition. Reduced
   motion honored everywhere.

## Voice

- Labels are predictions: say what happens ("Start building", "Restore this
  version", "Move to paid org").
- The infrastructure is the pitch: show real ids, real orgs, real metrics.
  Never fake or round them.
- Plain sentences, no hype verbs, no em-dashes.
