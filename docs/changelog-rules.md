You are responsible for maintaining this project’s changelog and release notes. Follow these instructions whenever you implement meaningful changes or prepare a release.

The goal is to help someone quickly understand what changed, why it matters, and whether they need to take action.

## 1. Understand the project first

Before writing or updating anything:

- Read the existing changelog, project instructions, version files, and release workflow.
- Identify the current released version and review the changes since that release.
- Inspect the actual implementation and relevant verification results. Use commit messages as clues, then confirm what changed.
- Follow the project’s established versioning and release automation. If no policy exists, use the defaults below.

Maintain the existing changelog location. Default to `CHANGELOG.md` if there is none.

## 2. Choose the correct version

Use `MAJOR.MINOR.PATCH`, such as `1.4.2`.

| Release type | Example | When to use it |
|---|---|---|
| **Major** | `1.4.2 → 2.0.0` | A change breaks compatibility with a supported public interface or documented contract. |
| **Minor** | `1.4.2 → 1.5.0` | A release adds compatible functionality, such as filters, exports, or an integration. |
| **Patch** | `1.4.2 → 1.4.3` | A release fixes existing behavior while preserving compatibility. |

Apply these rules:

- Determine the version from the highest-impact change in the whole release. Increment once per release.
- Reset minor and patch to zero for a major release; reset patch to zero for a minor release.
- Version components are integers: `1.9.0` is followed by `1.10.0`.
- Deprecating a public capability requires a minor increment; removing it incompatibly requires a major increment.
- For projects below `1.0.0`, follow their documented development policy and clearly identify breaking changes.

**A visually large update does not automatically require a major version.** A compatible redesign or substantial new feature can be a minor release. Code volume, development time, and the number of commits do not determine the version.

For an application, identify what compatibility means: supported integrations, configuration, import/export formats, or other documented behavior that users depend on.

If the project explicitly uses major versions for product milestones, follow that convention and document it separately from strict Semantic Versioning.

## 3. Keep development updates separate from releases

During normal development, add completed, relevant changes to `Unreleased`.

When preparing an actual release:

- Include only changes that belong to that release.
- Move those changes into the numbered release entry.
- Use the actual release date in `YYYY-MM-DD` format. Keep unreleased drafts clearly labeled.
- Update version files through the project’s existing release process.
- Leave a new `Unreleased` section for future work.

Keep releases newest first. Preserve historical entries, dates, and assets; correct factual mistakes transparently.

Updating a changelog does not itself mean the release has been published or deployed.

## 4. Write useful entries

For each noteworthy change, explain:

1. What changed.
2. What the user can now do, or what problem was resolved.
3. Any limitation, availability condition, or action they need to know about.

Use short, specific sentences and the terminology users see in the product.

Examples of the desired style:

- “Added saved searches so you can reuse your filters without setting them up again.”
- “Fixed an issue where changing pages cleared the selected date range.”
- “CSV exports now include the status column.”
- “Removed the legacy `/v1/search` endpoint. Update integrations to `/v2/search`; see the migration guide.”

Avoid vague entries such as “Improved experience,” “Various fixes,” or “Optimized performance.” Describe the actual improvement.

Additional rules:

- Group related implementation changes into one meaningful entry.
- Include internal changes when they affect users, integrators, compatibility, security, or operation of the product.
- Omit routine formatting, renaming, test maintenance, and refactoring with no relevant external effect.
- Include performance numbers only when measured, with enough context to understand the comparison.
- Distinguish general availability from beta access, feature flags, and staged rollout.
- Keep planned work out of shipped release notes.
- Use real issue, pull request, documentation, or migration links where helpful.

## 5. Use a consistent structure

For substantial releases, start with a short descriptive title, a one-sentence summary, and up to three highlights. Small patches can go straight to the relevant changes.

Group details under applicable headings:

- **Added:** New capabilities.
- **Changed:** Updates to existing behavior.
- **Deprecated:** Capabilities scheduled for removal, including alternatives.
- **Removed:** Capabilities that are no longer available.
- **Fixed:** Resolved defects.
- **Security:** Relevant security corrections.

Omit empty sections.

For breaking changes, place a clearly visible **Breaking changes and migration** section near the beginning. Explain who is affected, the previous and new behavior, and the steps needed to upgrade.

Include **Known issues** when a confirmed limitation materially affects the release.

## 6. Add screenshots and visuals where they help

Include visuals for meaningful interface changes: new screens, redesigned layouts, new workflows, or visible fixes that are easier to understand with an image.

Choose the appropriate format:

| Change | Preferred visual |
|---|---|
| New screen or feature | Screenshot showing the feature in use |
| Meaningful redesign | Comparable before-and-after screenshots |
| Multi-step interaction | Short recording or a small sequence of screenshots |
| Visible layout fix | Focused before-and-after comparison |
| Backend or API change | Relevant request/response example or concise diagram, when useful |

Capture screenshots from the actual running implementation using the available browser or screenshot tools.

Visual requirements:

- Show the release’s actual behavior.
- Use representative sample data.
- Keep text readable and crop around the relevant interface.
- Use consistent viewport, theme, zoom, and sample data for comparisons.
- Include a mobile view when the change materially affects mobile use.
- Add descriptive alt text and a short caption explaining what to notice.
- Use formats supported by the destination and compress assets without making text blurry.
- Prefer a few informative visuals over a long gallery.

Before-and-after images must show the actual previous and current implementations. Never invent the “before” state or present generated mockups as screenshots.

Use existing asset conventions. Otherwise, store images under:

`docs/changelog/assets/<version>/<feature-name>.png`

Use an `unreleased` folder while drafting, then move assets into the release folder and update their links when finalizing. Preserve older release images.

Use repository-relative links for repository Markdown. For a website or release platform, use durable asset URLs that render correctly there.

If capture is unavailable, complete the text and report which visual is missing. Do not insert broken image links or claim that a screenshot was captured.

## 7. Match the level of detail to the change

- **Patch:** Usually a short list of concrete fixes. Add a visual when it clarifies a visible correction.
- **Minor:** Brief summary, useful feature highlights, categorized details, and screenshots for significant interface additions.
- **Major:** Clear overview, prominent compatibility and migration guidance, major feature highlights, and visuals for significant interface changes.

These are presentation guidelines. Release length and image count do not determine the version.

## 8. Keep existing changelog surfaces consistent

If the project already has a “What’s New” page, changelog page, or release-note component, update its established source of truth.

Keep version numbers, dates, availability, descriptions, and images consistent across the repository and the product.

Use the existing design system. Make screenshots readable on mobile and provide larger views when the existing interface supports them.

## 9. Verify before finishing

Check that:

- Each entry matches the implementation included in the release.
- The proposed version matches the compatibility impact.
- Fixes and performance claims have appropriate supporting evidence.
- Release dates and availability statements are accurate.
- Links and images render in the intended destination.
- Breaking changes include actionable migration guidance.
- Historical releases remain intact.

Report any remaining evidence gaps clearly.

When finished, provide:

1. The current version and proposed next version, with a brief reason.
2. Whether the entry is unreleased, a release draft, or already published.
3. The changelog and related files updated.
4. The screenshots or visuals actually added.
5. A concise verification summary.

Apply these rules throughout development so the changelog stays current as meaningful changes are completed.