# pi-session-notify

Windows desktop notifications for the [Pi coding agent](https://pi.dev), showing **which Session and project** finished a response. Uses Windows PowerShell and the native toast API. No runtime dependencies, relay, telemetry, registry changes or session-body upload.

## Install

```bash
pi install npm:pi-session-notify
```

Git installation is also supported:

```bash
pi install git:github.com/zhitaoChen/pi-session-notify
```

Run `/reload` in each open Pi Session. New sessions load the package automatically. Requires Windows 10/11, Windows PowerShell 5.1 and Pi's `agent_settled` lifecycle (tested with Pi 1.4.0). Node 22.19+ is required; source tests require Node 22.18+ native TypeScript support.

Remove any older local `windows-notifications.ts` to prevent duplicate notifications. The official `titlebar-spinner.ts` example can stay installed: this package never changes the terminal title and does not duplicate the spinner.

## Controls

```text
/win-notify test
/win-notify status
/win-notify off
/win-notify on
```

The on/off switch is process-local and resets on reload. Set `PI_WINDOWS_NOTIFICATIONS=0` in the startup environment to disable by default.

## Behavior

- Notification title: `Pi · <Session name>` (or project name when unnamed).
- Body: response settled / final assistant call failed, plus project folder name.
- Silent toast; at most one automatic toast per 60 seconds in each process.
- Windows interactive TUI only. RPC/print/JSON sessions are inactive. Manual tests submit a real Windows notification.
- Interrupted responses do not notify. A final failed assistant call is distinguished from a normally settled response. This is **not** proof that the user's whole task succeeded; an ordinary answer may describe incomplete work or failed tools.
- No answer excerpts, prompts, code, tool arguments or credentials. Session/folder names are shown, so do not put secrets in those names.
- Windows Do Not Disturb/notification policy can hide a toast even when the API accepts it. The sender may appear under Windows PowerShell. Tests cannot prove a human saw a banner.

## Safety and limitations

Notification values are encoded as data and inserted through XML DOM text properties, not interpolated as executable PowerShell. One helper runs for each accepted settlement, bounded by a 15-second timeout. No administrator access or permanent execution-policy change is used.

This initial release resolves `powershell.exe` through PATH and inherits the process environment. Use only trusted startup environments and PATH entries. Extensions execute with the user's permissions and are not sandboxed. Automatic notification delivery errors are reduced to a generic warning; troubleshooting full OS errors requires local inspection.

There is no permission/question notification, cross-process deduplication, automatic upstream update or built-in queue. An API submission success does not guarantee display. Future Pi compatibility must be checked rather than assumed.

## Development

```bash
npm test
npm pack --dry-run
```

Tests cover label bounds, injection-safe data construction, lifecycle registration and RPC suppression. They do not show notifications. Windows toast submission and Pi extension loading are separate manual checks.

The use of `agent_settled` follows Pi's official `examples/extensions/notify.ts` pattern. This is an independent extension, not an official Pi package; no official spinner code is bundled.

## License

MIT.
