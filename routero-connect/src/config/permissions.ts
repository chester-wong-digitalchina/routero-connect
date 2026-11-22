import { spawn } from "node:child_process";
import { chmod, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { ConfigError } from "./errors";

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
try {
  $r = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($r.operation -eq 'copy') {
    $acl = Get-Acl -LiteralPath $r.source
    Set-Acl -LiteralPath $r.target -AclObject $acl
  } elseif ($r.operation -eq 'check') {
    $acl = Get-Acl -LiteralPath $r.target
    if ((Test-Path -LiteralPath $r.target -PathType Container) -and -not $acl.AreAccessRulesProtected) { throw 'unsafe' }
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    foreach ($rule in $rules) {
      if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($user.Value, 'S-1-5-18')) { throw 'unsafe' }
    }
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $user.Value) { throw 'unsafe' }
  } else {
    $directory = $r.operation -eq 'directory'
    if ($directory) { $acl = [Security.AccessControl.DirectorySecurity]::new() }
    else { $acl = [Security.AccessControl.FileSecurity]::new() }
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($user)
    foreach ($sid in @($user, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
      if ($directory) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
      } else { $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow') }
      $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $r.target -AclObject $acl
  }
  [Console]::Out.Write('ok')
} catch { exit 1 }
`;

async function windowsPermission(operation: string, target: string, source?: string): Promise<void> {
  const root = process.env.SystemRoot;
  if (!root || !isAbsolute(root)) { throw new ConfigError("recovery-unavailable"); }
  await new Promise<void>((done, reject) => {
    const child = spawn(join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", SCRIPT], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { SystemRoot: root, WINDIR: root, TEMP: dirname(target), TMP: dirname(target) } });
    let output = "";
    let settled = false;
    const fail = () => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new ConfigError("recovery-unavailable"));
    };
    const timer = setTimeout(fail, 10000);
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; if (output.length > 128) { fail(); } });
    child.stderr.resume();
    child.on("close", (code) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      if (code === 0 && output === "ok") { done(); } else { reject(new ConfigError("recovery-unavailable")); }
    });
    // Only filesystem paths, never file contents or keys, enter this subprocess.
    child.stdin.end(JSON.stringify({ operation, target, source }));
  });
}

export async function makePrivate(path: string, directory: boolean): Promise<void> {
  if (process.platform === "win32") { await windowsPermission(directory ? "directory" : "file", path); }
  else { await chmod(path, directory ? 0o700 : 0o600); }
}

export async function checkPrivate(path: string): Promise<void> {
  if (process.platform === "win32") { await windowsPermission("check", path); }
  else if (((await stat(path)).mode & 0o077) !== 0) { throw new ConfigError("recovery-unavailable"); }
}

export async function copyPermissions(source: string | undefined, destination: string): Promise<void> {
  if (source === undefined) { await makePrivate(destination, false); }
  else if (process.platform === "win32") { await windowsPermission("copy", destination, source); }
  else { await chmod(destination, (await stat(source)).mode & 0o777); }
}
