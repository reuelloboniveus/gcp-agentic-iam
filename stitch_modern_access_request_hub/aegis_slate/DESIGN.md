# Design System Documentation: The Vaulted Archive

## 1. Overview & Creative North Star
This design system is built for high-stakes Identity and Access Management (IAM). Our mission is to move beyond the "utilitarian dashboard" and into the realm of **The Vaulted Archive**. 

In an industry defined by rigid security, we use **Intentional Asymmetry** and **Tonal Depth** to create a sense of sophisticated protection. The interface should feel like a premium, high-contrast editorial piece—think of it as a digital private bank for data permissions. We break the "template" look by using a massive typographic scale contrast, overlapping floating elements, and a "depth-first" layout strategy that prioritizes focus over noise.

---

## 2. Colors: Depth Over Definition
The palette is rooted in deep navies and slate grays, designed to reduce eye strain for security operators while making vibrant status indicators "pop" like neon on a city street.

### Core Tokens
- **Background/Surface:** Use `surface` (#0b1326) as the base.
- **Primary (Action):** `primary` (#adc6ff) and `primary_container` (#0f69dc) provide the sapphire blue signature for active states.
- **Status (Secondary):** `secondary` (#4edea3) for Emerald Green (Approved/Success).
- **Status (Tertiary):** `tertiary` (#ffb95f) for Amber (Pending/Warning).

### The "No-Line" Rule
**Explicit Instruction:** Prohibit 1px solid borders for sectioning content. Boundaries must be defined solely through background color shifts. To separate a sidebar from a main feed, use a transition from `surface_container_low` to `surface`. This creates a cleaner, more modern aesthetic that feels "built" rather than "outlined."

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
1. **The Base:** `surface` (The foundation).
2. **The Field:** `surface_container_low` (Large content areas).
3. **The Focus:** `surface_container_highest` (Active cards or focused panels).

### The "Glass & Gradient" Rule
Floating elements (Modals, Popovers) must use **Glassmorphism**. Apply `surface_bright` with a 60% opacity and a 20px backdrop-blur. For primary CTAs, use a subtle linear gradient from `primary` to `primary_container` at a 135-degree angle to add "visual soul" and a tactile, premium feel.

---

## 3. Typography: Editorial Authority
We utilize a dual-font strategy to balance technical precision with high-end aesthetic appeal.

- **Display & Headlines (Manrope):** These are our "Editorial" anchors. Use `display-lg` and `headline-lg` for dashboard summaries and key security metrics. The wider tracking and geometric curves of Manrope convey modern authority.
- **Body & Utility (Inter):** Inter is our workhorse. Use `body-md` for data tables and `label-sm` for technical metadata. Inter ensures that complex IAM strings (e.g., `prj-int-test-edg-cloudops-23`) remain legible at small sizes.

**Hierarchy Tip:** Always pair a large `display-sm` metric with a tiny, all-caps `label-md` in `on_surface_variant` to create a professional, architectural contrast.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are often "muddy." This system uses light and tone to convey elevation.

- **The Layering Principle:** Depth is achieved by stacking. Place a `surface_container_high` card on top of a `surface_container` background. The slight shift in hex value creates a soft, natural lift.
- **Ambient Shadows:** When an element must "float" (like a global search bar), use a shadow with a blur of 40px, 0px offset, and 8% opacity of the `on_background` color. This mimics natural ambient light.
- **The "Ghost Border" Fallback:** If accessibility requirements demand a container edge, use the **Ghost Border**: `outline_variant` at 15% opacity. Never use a 100% opaque border.

---

## 5. Components: Precision Primitives

### Sleek Data Tables
*   **Structure:** No vertical or horizontal lines. 
*   **Separation:** Use 24px vertical padding per row.
*   **Hover State:** On hover, change the row background to `surface_container_highest` and apply a `xl` (0.75rem) corner radius to the row itself.
*   **Technical Strings:** Use `label-md` for role names (e.g., `dns.viewer`) inside a `surface_container_highest` pill with a slight `outline` ghost border.

### Status Badges
*   **Approved:** `on_secondary_container` text on a `secondary_container` background.
*   **Pending:** `on_tertiary_container` text on a `tertiary_container` background.
*   **Shape:** Always use `full` (pill) rounding for badges to distinguish them from rectangular data blocks.

### Action Buttons
*   **Primary:** `primary_container` background, `on_primary_container` text. Use `xl` (0.75rem) rounding.
*   **Secondary:** Ghost style. No background, `outline_variant` at 20% opacity for the border.
*   **Interactive:** On hover, primary buttons should scale 2% (`scale-102`) to provide a tactile "pressable" feeling.

### IAM Specific: The "Requestor" Cell
Combine typography for maximum info-density:
*   **Name:** `title-sm` in `on_surface`.
*   **Email:** `body-sm` in `on_surface_variant`.
*   **Layout:** Stacked vertically with 4px of spacing.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `surface_container_low` for the main dashboard background to allow "higher" cards to pop.
*   **Do** use `secondary` (Emerald) and `tertiary` (Amber) sparingly. They should be "beacons" of information in a sea of Navy.
*   **Do** utilize the `xl` (0.75rem) rounding for all major cards and containers to soften the "industrial" feel of IAM data.

### Don't
*   **Don't** use 1px solid white or gray lines to separate table rows. Use whitespace.
*   **Don't** use pure black (#000000). Our darkest color is `surface_container_lowest` (#060e20). Pure black kills the sophisticated tonal depth of the navy palette.
*   **Don't** mix Manrope and Inter in the same text block. Use Manrope for headers and Inter for the data/content below it.
*   **Don't** use "Drop Shadows" on buttons. Use tonal contrast or a subtle gradient to define the button's surface.

---

## 7. Interaction Note
Every interaction should feel "heavy" and secure. Use 300ms "Ease-Out" transitions for all hover states. This slight delay conveys a sense of deliberate action and system stability—key for an IAM environment where every click matters.