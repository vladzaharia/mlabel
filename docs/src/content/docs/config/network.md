---
title: Network policy
description: The single network key, what it permits, and what is denied in every configuration.
---

MLabel is local-first. The **only** remote request it is capable of making is its own
update check against GitHub Releases, and that is opt-out.

```jsonc
{
  "version": 2,
  "network": { "updateChecks": false }, // no network calls of any kind
  "input": {
    /* … */
  },
  "output": {
    /* … */
  },
}
```

Absent, or `true`, means update checks run. That is the default.

## What `false` actually does

It is not "skip the check". The config is the single gate for all network activity, and
loading one with `updateChecks: false`:

- closes a hard request-level gate, so any request is refused before it leaves,
- never starts the updater at all,
- greys out **Check for Updates…** in the menu.

There is no code path from a config in that state to a network request.

## What `true` permits

Even with checks enabled, the allowed destinations are enumerated:

- the MLabel releases path on `github.com`,
- the two GitHub hosts that release downloads redirect to.

Everything else is denied, including:

- **any request from the window itself**, in every configuration — the renderer's content
  policy restricts it to its own origin and the network layer refuses the rest,
- any navigation away from the app's own files,
- any URL handed to the "open in browser" path that is not an MLabel release page.

Requests are only permitted while a _loaded config_ permits them. Before any config loads,
nothing is allowed.

## Strictness matters here

`network` is validated strictly, like every other object in the config:

```jsonc
"network": { "updateCheck": false }
// ✗ Unrecognized key: "updateCheck"
```

This is exactly the reason the whole schema is strict. A silently dropped key here would
leave the permissive default in place — so a config that _reads_ as opting out of all
network would still be talking to GitHub, and nothing would say so.

## Choosing a setting

**Leave checks on** for ordinary use. Labelers get fixes without being asked to do anything,
and the traffic is one request to a well-known host on startup.

**Turn them off** when:

- the machine is air-gapped, or on a network where outbound traffic needs justification,
- you are shipping a fixed, validated version and do not want it changing underneath a
  labeling run,
- a compliance review is simpler if the answer to "does this make network requests" is a
  flat no.

The cost is that updates become a manual redistribution. See
[Deploying to labelers](/admin/deploying/).

## Verifying it

The claim is checkable from outside the app: run it with `updateChecks: false` behind a
proxy or a packet capture and you will see nothing at all. There is no telemetry, no crash
reporting, and no analytics in any build.
