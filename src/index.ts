import { execFile } from "node:child_process";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Use an existing Windows app identity; no registry changes or external relay.
const APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
const COOLDOWN_MS = 60_000;

export function cleanLabel(value: string): string {
	return value.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 100);
}

export function toastScript(title: string, body: string): string {
	// Data is base64-encoded JSON, never interpolated into executable PowerShell.
	const data = Buffer.from(JSON.stringify({ title, body, appId: APP_ID }), "utf8").toString("base64");
	return `
$ErrorActionPreference = 'Stop'
$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast duration="short"><visual><binding template="ToastGeneric"><text></text><text></text></binding></visual><audio src="ms-winsoundevent:Notification.Default"/></toast>')
$nodes = $xml.GetElementsByTagName('text')
$nodes.Item(0).InnerText = $d.title
$nodes.Item(1).InnerText = $d.body
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(2)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($d.appId)
$notifier.Show($toast)
`;
}

async function showToast(title: string, body: string): Promise<void> {
	const encoded = Buffer.from(toastScript(title, body), "utf16le").toString("base64");
	await new Promise<void>((resolve, reject) => {
		execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
			{ windowsHide: true, timeout: 15_000 }, (error) => {
				if (error) reject(new Error("Windows toast delivery failed; check Windows notification settings."));
				else resolve();
			});
	});
}

export default function (pi: ExtensionAPI) {
	let enabled = process.env.PI_WINDOWS_NOTIFICATIONS !== "0";
	let active = false;
	let outcome = "done";
	let lastSent = 0;

	function labels(ctx: ExtensionContext, test = false): [string, string] {
		const project = cleanLabel(path.basename(ctx.cwd));
		const name = cleanLabel(pi.getSessionName() || project);
		return [`Pi · ${name}`, `${test ? "通知测试" : outcome === "error" ? "本轮调用失败，请查看 Session" : "本轮已结束，等待输入"}\n项目：${project}`];
	}

	pi.on("agent_start", () => { active = true; outcome = "done"; });
	pi.on("message_end", (event) => {
		const message = event.message;
		if (message.role === "assistant") {
			outcome = message.stopReason === "error" ? "error" : message.stopReason === "aborted" ? "aborted" : "done";
		}
	});
	pi.on("agent_settled", async (_event, ctx) => {
		const wasActive = active;
		active = false;
		if (!wasActive || !enabled || process.platform !== "win32" || ctx.mode !== "tui" || outcome === "aborted") return;
		if (Date.now() - lastSent < COOLDOWN_MS) return;
		lastSent = Date.now();
		try { await showToast(...labels(ctx)); }
		catch { ctx.ui.notify("Windows 通知未送达；检查系统通知设置。可用 /win-notify test 重试。", "warning"); }
	});
	pi.on("session_shutdown", () => { active = false; });
	pi.registerCommand("win-notify", {
		description: "Windows completion notifications: test | on | off | status (switch applies to this process)",
		handler: async (args, ctx) => {
			const action = args.trim() || "status";
			if (action === "on" || action === "off") enabled = action === "on";
			else if (action === "test") {
				if (process.platform !== "win32") { ctx.ui.notify("Windows only.", "warning"); return; }
				try { await showToast(...labels(ctx, true)); ctx.ui.notify("测试通知已提交给 Windows。", "info"); }
				catch { ctx.ui.notify("Windows 通知未送达；检查系统通知设置。", "warning"); }
				return;
			} else if (action !== "status") { ctx.ui.notify("Usage: /win-notify test|on|off|status", "warning"); return; }
			ctx.ui.notify(`Windows notifications: ${enabled ? "on" : "off"}; Windows default sound, interactive sessions only, 60s cooldown.`, "info");
		},
	});
}
