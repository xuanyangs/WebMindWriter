import fs from "node:fs/promises";
import path from "node:path";
import {
  writeLocalUiServerSmokeReport,
  type LocalUiServerSmoke
} from "./localUiServer.js";
import {
  writeUiBrowserSmokeReport,
  type UiBrowserSmoke
} from "./browserSmoke.js";
import type { CloudServicePaths } from "../services/cloudService.js";

export type LocalUiLaunchPaths = CloudServicePaths & {
  uiDir: string;
};

export type LocalUiLaunch = {
  generatedAt: string;
  port: number;
  apiBase: string;
  dashboardPath: string;
  editorPath: string;
  manifestPath: string;
  reportPath: string;
  serverSmokePath: string;
  browserSmokePath: string;
  commands: {
    launch: string;
    check: string;
    daily: string;
  };
  checks: {
    name: string;
    ok: boolean;
    detail: string;
  }[];
};

export async function writeLocalUiLaunchReport(
  paths: LocalUiLaunchPaths,
  options: { port: number }
): Promise<{
  manifestPath: string;
  reportPath: string;
  launch: LocalUiLaunch;
}> {
  await fs.mkdir(paths.uiDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const serverSmoke = await writeLocalUiServerSmokeReport(paths, {
    port: options.port
  });
  const browserSmoke = await writeUiBrowserSmokeReport(paths, {
    port: options.port
  });
  const manifestPath = path.join(paths.uiDir, "launch-manifest.json");
  const reportPath = path.join(paths.reportDir, "latest-ui-launch.md");
  const launch: LocalUiLaunch = {
    generatedAt: new Date().toISOString(),
    port: options.port,
    apiBase: `http://127.0.0.1:${options.port}`,
    dashboardPath: path.join(paths.uiDir, "latest-dashboard.html"),
    editorPath: path.join(paths.uiDir, "project-editor.html"),
    manifestPath,
    reportPath,
    serverSmokePath: serverSmoke.reportPath,
    browserSmokePath: browserSmoke.reportPath,
    commands: {
      launch: "npm run agent:ui:launch",
      check: "npm run agent:ui:launch:check",
      daily: "npm run agent:run -- --goal daily"
    },
    checks: [
      ...prefixChecks("server", serverSmoke.smoke),
      ...prefixChecks("browser", browserSmoke.smoke)
    ]
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(launch, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderLocalUiLaunchReport(launch), "utf8");

  return { manifestPath, reportPath, launch };
}

function prefixChecks(
  prefix: string,
  smoke: LocalUiServerSmoke | UiBrowserSmoke
): LocalUiLaunch["checks"] {
  return smoke.checks.map((check) => ({
    name: `${prefix}:${check.name}`,
    ok: check.ok,
    detail: check.detail
  }));
}

function renderLocalUiLaunchReport(launch: LocalUiLaunch): string {
  return [
    "# Local UI Launch Report",
    "",
    `- Generated at: ${launch.generatedAt}`,
    `- API base: ${launch.apiBase}`,
    `- Dashboard: ${launch.dashboardPath}`,
    `- Editor: ${launch.editorPath}`,
    `- Manifest: ${launch.manifestPath}`,
    `- Server smoke: ${launch.serverSmokePath}`,
    `- Browser smoke: ${launch.browserSmokePath}`,
    "",
    "## Commands",
    "",
    `- Launch: \`${launch.commands.launch}\``,
    `- Check: \`${launch.commands.check}\``,
    `- Daily: \`${launch.commands.daily}\``,
    "",
    "## Checks",
    "",
    "| Check | OK | Detail |",
    "| --- | --- | --- |",
    ...launch.checks.map(
      (check) => `| ${check.name} | ${check.ok ? "yes" : "no"} | ${check.detail} |`
    ),
    "",
    "## Open",
    "",
    "1. Run `npm run agent:ui:launch`.",
    "2. Open `ui/latest-dashboard.html` or `ui/project-editor.html`.",
    "3. Keep API as `http://127.0.0.1:4317` in the editor toolbar.",
    ""
  ].join("\n");
}
