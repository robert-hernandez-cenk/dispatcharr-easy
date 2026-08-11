# Per-profile channel overrides (independent output "lists")

**Goal:** give each Channel Profile its own independent channel **numbering,
names, categories (groups), and logos**, so one channel can appear differently
in each exposed output ("list") — matching iptveditor.com's multi-list editing.
This is the one iptveditor capability Dispatcharr's data model does **not**
currently provide.

**Nature of the change:** this is a **Dispatcharr backend** change (a fork or,
preferably, an upstream PR). `dispatcharr-easy` is a frontend-only overlay and
cannot add it alone; it consumes the new API once the backend ships it.

A ready-to-apply patch lives next to this doc:
[`per-profile-overrides.patch`](./per-profile-overrides.patch)
(`git apply -p1 per-profile-overrides.patch` from a Dispatcharr checkout).

---

## Why this is tractable, not a rewrite

Dispatcharr already has the exact seam we need:

- **Profile-scoped selection already works.** Output already filters by
  `channelprofilemembership__channel_profile=… , enabled=True`.
- **There is already one override → default resolver.**
  `apps/channels/managers.py::with_effective_values()` coalesces a per-channel
  `ChannelOverride` row over the provider value and exposes
  `effective_channel_number`, `effective_name`, `effective_channel_group_obj`,
  `effective_logo_obj`. Every output path (M3U / EPG / Xtream / HDHR) reads
  those `effective_*` values and sorts by `effective_channel_number`.

The only reason numbers/names are identical across profiles today is that the
override is scoped **one-per-channel** instead of **one-per-(profile, channel)**.
`ChannelProfileMembership` already *is* the per-(profile, channel) row (it holds
`enabled`, with `unique_together = (channel_profile, channel)`). So the change
is: **put the overrides on that membership row and teach the resolver to prefer
them.** Scalar values (number, name) then flow through the existing annotations
with zero output-loop changes.

---

## Design

Precedence for a field becomes: **profile-membership override → channel-level
`ChannelOverride` → channel's own (provider) value.**

Only a narrow set is profile-overridable (a profile is an output *list*, so it
re-numbers / renames / re-categorizes / re-logos — EPG and stream-profile stay
channel-global):

```
PROFILE_OVERRIDABLE_FIELDS = ("name", "channel_number", "channel_group_id", "logo_id")
```

Per-profile **channel_number** doubles as per-profile **ordering**, because all
outputs already `.order_by("effective_channel_number")`.

---

## What the patch changes (file by file)

| File | Change |
|---|---|
| `apps/channels/models.py` | Add nullable `name`, `channel_number`, `channel_group`, `logo` columns to `ChannelProfileMembership`. Make `Channel._resolve_effective_fk()` honor the profile-aware `effective_<field>_id` annotation (for group/logo objects), falling back to today's behavior when absent. Thread `profile=` through the `ChannelManager.with_effective_values` shortcut. |
| `apps/channels/managers.py` | Add `PROFILE_OVERRIDABLE_FIELDS`; give `with_effective_values(queryset, profile=None, …)` an optional profile. When set, join the membership via `FilteredRelation` (collapses the reverse relation to the single row for that profile) and coalesce its columns **first**. |
| `apps/channels/serializers.py` | Widen `ChanneProfilelMembershipUpdateSerializer` with optional `name` / `channel_number` / `channel_group_id` / `logo_id` (omit = leave unchanged, `null` = clear). |
| `apps/channels/api_views.py` | In the profile `channels/bulk-update/` PATCH, set the override columns on each membership and include them in `bulk_update` / `bulk_create`. |
| `apps/output/views.py` | `generate_m3u`: resolve `channel_profile` and pass `profile=` into `with_effective_values`. This lights up per-profile number/name/group/logo on `/m3u/<profile>`. |
| `apps/channels/migrations/9999_…py` | Adds the four nullable columns. Rename + set `dependencies` to your fork's latest `channels` migration, **or** delete it and run `makemigrations channels`. |

Fully backward-compatible: every new column is nullable and defaults to
"inherit", so existing output is byte-identical until an override is set.

### Why scalars need no output-loop edits
The M3U/EPG/XC builders read `channel.effective_name` and
`channel.effective_channel_number` — the annotated columns. Once the annotation
coalesces the membership value first, those reads return the per-profile value
automatically, and `order_by("effective_channel_number")` re-sorts per profile.
Only **group** and **logo** are read as *objects* (via the `effective_*_obj`
properties), which is why `_resolve_effective_fk` is made annotation-aware.

---

## What the patch intentionally leaves for you

1. **Thread `profile=` into the remaining output paths.** The patch wires
   `generate_m3u` (the headline `/m3u/<profile>` case). Apply the identical
   one-line change wherever else you want per-profile output. Confirmed call
   sites in `apps/output/views.py`:
   - the EPG / XMLTV endpoint builder,
   - `_xc_live_streams_setup` (Xtream live streams, ~line 655),
   - `xc_get_epg` (~line 799/845),
   - the HDHR `lineup.json` builder.
   The Xtream/HDHR paths are **user-driven** and a user may hold several
   profiles at once, so "the profile" is ambiguous there — decide the policy
   (e.g. only apply overrides when the user maps to exactly one profile) before
   wiring them. Run `grep -rn "with_effective_values\|effective_channel_number" apps/`
   to find every consumer.

2. **Per-profile number uniqueness.** `Channel.clean()` enforces "unique number
   within group" on the *channel* table only; it does not cover membership
   overrides. If you want the same guarantee per profile, validate it in the
   bulk-update view (cheap: check the profile's memberships for a collision
   before saving). A DB constraint is awkward because the group is itself
   overridable — do it in application code.

3. **Per-profile auto-numbering.** `get_next_available_channel_number` /
   `compact_numbering.build_reserved_set` reserve numbers globally. A "renumber
   this profile 1..N" convenience would need a profile-scoped reserved set. Not
   required for manual editing.

4. **N+1 on remapped group/logo.** `_resolve_effective_fk` does one extra query
   per row **only** when a profile actually remaps that row's group/logo to an
   object not already selected. To eliminate it, add `_pm__channel_group` /
   `_pm__logo` to the `FilteredRelation` select or preload a `{id: obj}` map in
   the builders. Fine to defer.

5. **Frontend (`dispatcharr-easy`).** Re-run `npm run generate-api` against the
   forked instance so `schema.d.ts` picks up the widened bulk-update body, then
   build the per-profile channel grid (inline-editable number / name / group /
   logo) that PATCHes `/api/channels/profiles/{id}/channels/bulk-update/`.

---

## Testing

- **Unit** (`with_effective_values`): with `profile=P`, `effective_*` coalesces
  membership → channel override → channel for number/name/group/logo; without a
  profile, behavior is unchanged.
- **Integration**: two profiles A and B containing the same channel with
  different membership `channel_number`/`name` → `GET /m3u/A` and `GET /m3u/B`
  emit different `tvg-chno`, names, and ordering; `GET /m3u` (no profile) is
  unchanged from before the patch.
- **Migration**: applies on a populated DB; pre-existing output is identical
  until an override is set.

---

## Effort

- **Backend (this patch + finishing the items above):** ~3–5 focused days. The
  only non-mechanical part is the group/logo object resolution, already handled
  here.
- **Frontend editor:** ~1–2 weeks, on top of the base profile/channel tables.

## Upstream vs. fork

The change is small and generally useful (there is existing community demand for
profile-scoped output). Floating it as an upstream PR keeps `dispatcharr-easy` a
pure frontend overlay and avoids a permanent rebase tax. The patch is written to
be upstream-friendly (nullable, backward-compatible, reuses the existing
override/effective-values pattern). A private fork is viable too — the change
surface is small (models + one resolver + serializer/view + migration).
