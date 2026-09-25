---
title: Network policy
description: The two network keys, what each permits, and what is denied in every configuration.
---

MLabel is local-first. It makes **two** kinds of remote request, each behind its own key,
each opt-out, and each denied by default until a config says otherwise:

| Key                     | What it fetches                     | From            |
| ----------------------- | ----------------------------------- | --------------- |
| `network.updateChecks`  | A new version of MLabel             | GitHub Releases |
| `network.modelDownload` | Model weights for anomaly detection | Hugging Face    |

With both `false`, the app makes no network calls of any kind.

```jsonc
{
  "version": 2,
  "network": { "updateChecks": false, "modelDownload": false },
  "input": {
    /* … */
  },
  "output": {
    /* … */
  },
}
```

Absent, or `true`, means the traffic is permitted. That is the default for both.

## What `false` actually does

It is not "skip it". The config is the gate for all network activity, and loading one with a
key set to `false`:

- closes a hard request-level gate, so a request of that kind is refused before it leaves,
- never starts the machinery at all — no updater, no downloader,
- disables the control that would trigger it (**Check for Updates…** greys out in the menu;
  the model download buttons disappear from Settings).

There is no code path from a config in that state to a request of that kind.

## The two scopes cannot reach each other

Each kind of traffic runs on its own network session with its own allowlist:

- the update scope may reach the MLabel releases path on `github.com` and the two GitHub
  hosts that release downloads redirect to — and nothing else,
- the model scope may reach `huggingface.co`, `hf.co` and their regional CDNs — and nothing
  else.

This is the point of separating them. The updater session cannot reach Hugging Face and the
model session cannot reach GitHub, so a bug in one cannot borrow the other's permission.
Enabling model downloads does not widen what the updater may do, and vice versa.

Everything else is denied in every configuration, including:

- **any request from the window itself** — the renderer's content policy restricts it to its
  own origin and the network layer refuses the rest,
- any navigation away from the app's own files,
- any URL handed to the "open in browser" path that is not an MLabel release page.

Requests are only permitted while a _loaded config_ permits them. Before any config loads,
nothing is allowed.

## Running a model is not a network request

Anomaly detection downloads a model **once**, and only if `modelDownload` permits it. After
that the model runs entirely on the machine: loading it and analysing a record involve no
network at all, and the app never contacts anything to ask what to download. Every model it
will fetch — the repository, the exact filename, the byte length and the SHA-256 — is fixed
in the app's own source and verified after the transfer. A file that does not match is
deleted rather than used.

So a labeler with a model already on disk keeps working with `modelDownload: false`, and with
both keys `false` an air-gapped machine still gets anomaly detection.

## What the network panel shows

**Settings → Network** lists what the app did, this session, capped at the last 50 entries and
gone when you quit. It records:

- every host the app opened a request to, once per host — including the redirect targets that
  actually served the bytes, which are usually not the host in the URL,
- every request that was refused, and the host it was aimed at,
- the start and outcome of each update check and model download,
- every release page handed to your browser.

Two things the app does are genuinely outside that list, and it is more useful to say so than
to claim otherwise:

- **Opening a release page in your browser.** The URL is checked against the release path
  before it leaves, and the panel records it — but once your browser has it, what happens next
  is your browser's business, not the app's.
- **Certificate-revocation and DNS lookups.** These are made by the networking stack
  underneath the application, as they are for any program that opens a connection. They carry
  no application data.

## Strictness matters here

`network` is validated strictly, like every other object in the config:

```jsonc
"network": { "updateCheck": false }
// ✗ Unrecognized key: "updateCheck"
```

This is exactly the reason the whole schema is strict. A silently dropped key here would
leave the permissive default in place — so a config that _reads_ as opting out of all network
would still be talking to GitHub, and nothing would say so.

## Choosing a setting

**Leave both on** for ordinary use. Labelers get fixes without being asked to do anything, and
can turn on anomaly detection if it helps them.

**Turn them off** when:

- the machine is air-gapped, or on a network where outbound traffic needs justification,
- you are shipping a fixed, validated version and do not want it changing underneath a
  labeling run,
- a compliance review is simpler if the answer to "does this make network requests" is a
  flat no.

The cost of `updateChecks: false` is that updates become a manual redistribution — see
[Deploying to labelers](/admin/deploying/). The cost of `modelDownload: false` is that a
labeler cannot fetch a model they do not already have; one already on disk is unaffected.

A labeler can narrow either of these further in Settings, but never widen them. The config is
a floor, not a suggestion.

## Verifying it

The claim is checkable from outside the app, and it is worth checking rather than believing:
run it with both keys `false` behind a proxy or a packet capture and you will see nothing at
all. There is no telemetry, no crash reporting, and no analytics in any build.
