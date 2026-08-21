# Deployment via Bitbucket Pipelines

> **Pi-mirror note.** Pi-adapted copy of the `engineering-foundation` wiki page; the wiki is the source of truth, kept fresh by the `engineering-sync` skill. The body is unchanged — this page carries no Cursor-specific tool-call edges, only references to the target repo's own files (AGENTS.md, CLAUDE.md, .cursor/rules, .agents/skills).


This page explains how to roll out a release or hotfix as a developer or tech lead using Bitbucket Pipelines, and how CodeArtifact publishing works in that process. It describes the **manual flow from the Bitbucket UI perspective** — for technical details of the pipeline definitions, see the [deploy-to-aws repository documentation](/knowledge/bitbucket-anwaltde-deploy-to-aws/bd0310bb-7aa0-4dc9-9b11-3007f58de83a).

> **Note:** The pipeline rollout is not yet complete across all repos. Repos that do not yet deploy via Bitbucket Pipelines at all are not covered here.

---

## Overview: Which pipeline variants are there?

Most repos use `deploy-to-aws` as a shared pipeline library. Depending on the repo type, one of the following pipeline files is used:

| Pipeline file | Target | Special feature |
|---|---|---|
| `container-build-and-deploy.yml` | ECS (Docker/ECR) | Standard, no `develop` branch |
| `container-build-and-deploy-with-develop.yml` | ECS (Docker/ECR) | With `develop` branch and mergeback |
| `container-build-and-deploy-with-assets.yml` | ECS + Nuxt CDN Assets | Optionally with `develop` branch |
| `cdn-assets-build-and-deploy.yml` | S3 CDN (no ECS) | Pure static frontends / micro-frontends |
| `sls-build-and-deploy.yml` | Serverless Framework | No `develop` branch |

There are also repos that manage deployment **without `deploy-to-aws`** independently — their pipelines differ from this flow.

---

## How to start a pipeline manually

All release and deploy pipelines are **Custom Pipelines** that you trigger manually:

1. Open the repo in Bitbucket and go to **Pipelines**.
2. Click **Run pipeline** in the top right.
3. Select the **branch** you want to run the pipeline against.
4. Under **Pipeline**, select the desired custom pipeline (e.g. *Create and Deploy Release*).
5. Click **Run**.

You can track progress on the Pipelines page. Steps marked as **manual** will pause and wait for your click (▶) before continuing.

---

## Regular release deployment

### When?

When a planned release with new features or bug fixes is ready to go to production.

### Step by step

**1. Start the custom pipeline**

Start the custom pipeline **"Create and Deploy Release"** (`create-release`):

- For repos **without** a `develop` branch: start from the `main` branch.
- For repos **with** a `develop` branch: start from the `develop` branch.

**2. Choose the version**

Bitbucket will ask you for the `RELEASE_TYPE` before starting:

| Option | When to use |
|---|---|
| `major` | Breaking changes or fundamentally new features |
| `minor` | New features, backwards-compatible (default for feature releases) |
| `patch` | Bug fixes, minor corrections (default for bugfix releases) |

**3. What happens automatically**

After clicking **Run**, the pipeline runs through on its own:

1. **Cut release branch** — a `release/<version>` branch is created and the version number in the repo is bumped.
2. **Prepare Release** — Jira tickets are collected from the Git log, a Jira version is created, a `CHANGELOG.md` is written, a bilingual release summary is generated via Claude, and a preparation post is sent to the Teams channel.
3. **Deploy to Stage (Legacy)** — the release is automatically deployed to the stage environment.
4. **⏸ Manual gate: "Merge to main"** — the pipeline pauses here. Review the stage deployment, then click ▶ on the manual step in the Bitbucket UI to trigger the merge.
5. **Deploy to Production** — after the merge, the production deployment runs automatically.
6. **Post Release Summary** — an EN/DE summary is posted to the Teams channel, the Jira version is marked as released, and the release branch is deleted.

> **Important:** Only start "Create and Deploy Release" **once per release**. Cutting the branch triggers everything else automatically — your only manual action is the "Merge to main" gate.

> **Repos with a `develop` branch:** The flow is identical, except that the release branch is cut from `develop` and after production a mergeback to `develop` also takes place.

---

## Hotfix deployment

### When?

When a critical bug in production needs to be fixed without waiting for the next regular release.

### Difference from a regular release

- For a hotfix, **no separate custom pipeline start** is needed — you cut the hotfix branch manually (or via `create-release` from `main`) as `hotfix/<version>`.
- Repos **with** a `develop` branch: start `create-release` from `main` (not from `develop`) — this creates a `hotfix/<version>` branch instead of a `release/<version>` branch.
- Repos **without** a `develop` branch: behaves identically to a regular release, only the branch name differs (`hotfix/` instead of `release/`).

### Step by step

**1. Create the hotfix branch**

Start the custom pipeline **"Create and Deploy Release"** (`create-release`) **from `main`**, with `RELEASE_TYPE=patch`.

→ This creates a `hotfix/<version>` branch. The pipeline trigger `release-branch` applies to both `release/*` and `hotfix/*`.

**2. What happens automatically**

The flow is identical to the regular release:

1. **Author Guard** — verifies that the branch was correctly created by the pipeline (no manually cut branch).
2. **Prepare Release** — CHANGELOG, Jira version, Teams notification.
3. **Deploy to Stage (Legacy)** — automatic stage deployment.
4. **⏸ Manual gate: "Merge to main"** — click ▶ after your review.
5. **Deploy to Production** — automatically after the merge.
6. **Post Release Summary** — Teams post, Jira version marked as released, branch cleanup.

> **Safety mechanism (Stale-Run Guard):** If you push a fix commit after the stage deployment and thereby start a new pipeline run, the `merge-release.sh` step of the old run will detect that a newer run exists and refuse the merge. Always use only the **most recent run** for the merge.

---

## CodeArtifact publishing via `deploy-to-aws`

### When does publishing apply?

Publishing npm packages to **AWS CodeArtifact** is an **opt-in** step and runs automatically as part of the release flow — provided the repo is configured for it. It is **not a manual step**.

A package is only published if its `package.json` has:
1. A **`publishConfig`** block (e.g. `"publishConfig": { "registry": "..." }`), **and**
2. **not** `"private": true` set.

### How is the step triggered?

This depends on the pipeline file used:

| Pipeline | Opt-in mechanism |
|---|---|
| `cdn-assets-build-and-deploy.yml` | `prepare-release.sh` detects via `detect` whether `publishConfig` is present → exports `PUBLISH_TO_CODEARTIFACT=true`. The step appears as **Skipped** in the Bitbucket UI if the package has not opted in. |
| `container-build-and-deploy-with-assets.yml` | The publish step always runs, but is a no-op if no `publishConfig` is present. |

### Which packages are published?

`publish-codeartifact.sh` determines the directories to publish using this priority:

1. **`CODEARTIFACT_PACKAGES`** (repository variable) — comma-separated list of directories (e.g. `packages/ci-tokens packages/ci-preset`). For monorepos.
2. **`CODEARTIFACT_WORKDIR`** (repository variable) — single directory. Defaults to `app` for the CDN pipeline.
3. **Auto-discover** — all `packages/*/package.json` plus `app/package.json`, if present.

### When is publishing performed?

The publish step runs **after the production deployment**, against the **semver tag** set by `prepare-release.sh` — not against the current commit. This ensures that the published version exactly matches the released version.

### Retry safety

If a version already exists in CodeArtifact, that package is **skipped** (no error). The step is idempotent — you can safely run it again.

### Credentials

Publishing uses the **EC2 instance role** of the self-hosted runners (no manual credentials management needed). Workspace-level CodeArtifact user credentials are explicitly deactivated before the step.

---

## Further documentation

- [AWS Cloud Infrastructure – Available Pipelines](/knowledge/aws-cloud-infrastructure/53465d50-6dbd-4f6b-8e34-c7a3553e19c7) — Overview of all pipelines from the Bitbucket UI perspective
- [deploy-to-aws: System Architecture Overview](/knowledge/bitbucket-anwaltde-deploy-to-aws/bd0310bb-7aa0-4dc9-9b11-3007f58de83a) — Technical architecture of the pipeline library
- [deploy-to-aws: Release Ceremony](/knowledge/bitbucket-anwaltde-deploy-to-aws/9d9ba441-0a91-40da-ad35-ef0cbf0e118a) — Scripts and Gitflow details
- [deploy-to-aws: Publish to CodeArtifact](/knowledge/bitbucket-anwaltde-deploy-to-aws/50f14b3e-ae79-4250-968d-a1f0a1266c9c) — Opt-in mechanism and configuration in detail
