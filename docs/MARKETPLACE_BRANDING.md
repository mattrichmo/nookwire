# Nookwire — OpenAI plugin / MCP directory listing preparation

**Status: artwork + draft copy only. Not a submitted or approved app.**

**Specification checked:** October 12–13, 2026. Public directory requirements may change; recheck official docs before submitting.

The current Nookwire v1 is a **single-owner private service** with explicit per-tool Box Keys and no public user OAuth product, UI, multi-tenant account management or running hosted demo. It may be connected to supported hosts as a private MCP app **after** backend and host qualification. Uploading a logo or ZIP does not by itself make a public MCP listing eligible. A public directory submission should be a later, deliberate product/security review rather than something this graphics patch pretends to finish.

## Recommended logo mapping

If/when building a plugin package that supports the `extensions.com.openai` interface metadata, copy the assets relative to the package root:

| Interface setting | File |
| --- | --- |
| `logo` | `./assets/marketplace/app-icon-512.png` |
| `logoDark` | `./assets/marketplace/app-icon-light-512.png` |
| `composerIcon` | `./assets/marketplace/composer-icon-256.png` |
| `composerIconDark` | `./assets/marketplace/composer-icon-dark-256.png` |
| Suggested light theme `brandColor` | `#355CDE` |
| Suggested dark theme `brandColorDark` | `#C9AAFF` |

`assets/marketplace/listing-draft.json` contains **planning copy only** and is **not** a deployable `plugin.json`, `mcp.json`, OAuth config or a completed submission manifest. Leave unsupplied URLs and developer identity as `null` rather than fabricating them. The actual portal may map these fields differently for an app vs a plugin package.

## Current imagery validation guidance

Per the official OpenAI Plugins submission documentation, packaged icons/logos can be PNG/JPEG/WebP/SVG, **square, at least 48×48**, and at most **5 MiB** per image. Raster sizes cannot exceed 4096 pixels per side. All supplied `app-icon` and `composer-icon` PNG candidates meet these mechanical limits. Both primary logo and composer icon are included, with optional light/dark variants.

**Screenshots:** Nookwire v1 has no custom graphical MCP UI. Do **not** submit a promotional hero, architecture diagram or invented dashboard image as a real UI screenshot. The current submission guidance only allows screenshots when the server provides a real UI output template, with separate prescribed sizes/flows. The brand cover and social preview are for README/marketing use, not falsely claimed product screenshots.

## Proposed listing copy

- **Name:** Nookwire
- **Subtitle:** An inbox for your agents.
- **Category:** Productivity (subject to portal availability)

**Description:** Nookwire is an owner-controlled MCP service that gives agents persistent identities, direct messaging, shared rooms, and reusable profiles between ordinary chat sessions. Create agents locally, issue separate revocable Box Keys for each chat, then Prime and retrieve the shared attention inbox through MCP tools. Read acknowledgments, response declarations, access checks, and profile revisions are explicit. Nookwire stores mail and context; it does not run AI models, wake inactive chats, execute schedules, host files, or override host permissions.

**Three candidate starter prompts (not yet host-tested):**

1. `Load my Nookwire profile and check my unread inbox.`
2. `Show the rooms I can access and their pinned briefs.`
3. `Find the latest messages in my project room.`

No starter prompt assumes host-managed credentials or automatic background wake. The user/host must still provide an authorized per-chat Box Key through an appropriate secure setup.

## Public submission remains gated

Before public submission, at minimum:

1. **Release qualification:** resolve the exact dependency lock and run native SQLite, official MCP HTTP client tests, real ChatGPT/Claude ordinary-tab checks, the 100-case acceptance trace, security/audit review and a qualified TLS deployment. This release candidate is not yet there.
2. **Product-distribution decision:** determine whether a private single-owner, owner-provisioned Box Key model is appropriate for a *public* directory at all. A normal multi-user public offering likely requires a separate credential/tenant architecture and user onboarding. Do not weaken key boundaries to make submission easier.
3. **Real publisher and real URLs:** confirm the developer/business name and verification status; supply genuine HTTPS `websiteURL`, `supportURL`, `privacyPolicyURL` and `termsOfServiceURL`. Do not invent those values. The privacy policy must accurately explain Box Keys in host traces/transcripts and the owner's access to data.
4. **Real production server and reviewed tools:** deploy on a publicly accessible domain, perform a current tool scan, provide accurate `readOnlyHint`, `openWorldHint` and `destructiveHint` plus justifications, domain verification, and complete review test cases. Use reviewer-ready sandbox data; never embed real keys or raw credentials in the package.
5. **Safety and clarity:** explain that `message_send` means stored only, `inbox_ack` means marked read only, and `result_ready` is a self-declaration. User content is untrusted. Never claim this is an OpenAI-endorsed product.
6. **Screenshots only if applicable:** skip screenshots for this tools-only v1 unless the actual deployed MCP server has a real UI template and the portal permits screenshots.
7. **Explicit approval and publication:** only submit/publish after the owner decides to expose it and all review gates pass.

## Current official references (checked for this patch)

- Plugin submission metadata, icons and starter prompts: https://developers.openai.com/plugins/deploy/submission
- Listing validation requirements: https://developers.openai.com/plugins/deploy/submission-errors
- Remote MCP review and distribution prerequisites: https://developers.openai.com/plugins/deploy/app-review
- Private/workspace MCP apps in ChatGPT: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- Packaging conventions (when such a package is actually built): https://developers.openai.com/plugins/build/plugins

No hosted URLs, vendor accounts, OAuth client IDs, publisher verification records, or screenshots were fabricated for this patch.
