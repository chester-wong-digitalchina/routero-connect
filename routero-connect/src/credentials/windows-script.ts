/** Trusted, bundled source only. No request value is interpolated into this code. */
export const WINDOWS_CREDENTIAL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$mutex = $null
$held = $false
$stage = 'compile'
try {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class RouteroNativeCredential {
  private const string Marker = "Routero Connect credential v1";
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  [DllImport("Advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern bool ReadNative(string target, uint type, uint flags, out IntPtr value);
  [DllImport("Advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern bool WriteNative(ref Credential value, uint flags);
  [DllImport("Advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern bool DeleteNative(string target, uint type, uint flags);
  [DllImport("Advapi32.dll", EntryPoint="CredFree")]
  private static extern void FreeNative(IntPtr value);
  public static string Read(string target) {
    IntPtr pointer;
    if (!ReadNative(target, 1, 0, out pointer)) {
      int error = Marshal.GetLastWin32Error();
      if (error == 1168) return null;
      throw new Win32Exception(error);
    }
    try {
      Credential value = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
      if (value.UserName != "routero-connect" || value.Comment != Marker)
        throw new InvalidOperationException("foreign-entry");
      if (value.CredentialBlobSize > 2560) throw new InvalidOperationException("invalid-entry");
      byte[] bytes = new byte[value.CredentialBlobSize];
      try {
        Marshal.Copy(value.CredentialBlob, bytes, 0, bytes.Length);
        return new UTF8Encoding(false, true).GetString(bytes);
      } finally { Array.Clear(bytes, 0, bytes.Length); }
    } finally { FreeNative(pointer); }
  }
  public static void Write(string target, string payload) {
    byte[] bytes = Encoding.UTF8.GetBytes(payload);
    if (bytes.Length > 2560) throw new InvalidOperationException("invalid-entry");
    IntPtr pointer = Marshal.AllocHGlobal(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, pointer, bytes.Length);
      Credential value = new Credential();
      value.Type = 1; value.TargetName = target; value.Comment = Marker;
      value.CredentialBlobSize = (uint)bytes.Length; value.CredentialBlob = pointer;
      value.Persist = 2; value.UserName = "routero-connect";
      if (!WriteNative(ref value, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally {
      for (int i = 0; i < bytes.Length; i++) Marshal.WriteByte(pointer, i, 0);
      Array.Clear(bytes, 0, bytes.Length); Marshal.FreeHGlobal(pointer);
    }
  }
  public static void Delete(string target) {
    if (!DeleteNative(target, 1, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@ | Out-Null
  $stage = 'request'
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($request.target -notmatch '^RouteroConnect/v1/[a-f0-9]{64}$') { throw 'invalid-entry' }
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $stage = 'mutex'
  $name = 'Global\RouteroConnect-v1-' + $sid + '-' + $request.target.Substring(18)
  $mutex = [Threading.Mutex]::new($false, $name)
  try { $held = $mutex.WaitOne(2000) } catch [Threading.AbandonedMutexException] { $held = $true }
  if (-not $held) { throw 'timeout' }
  $stage = 'read'
  $current = [RouteroNativeCredential]::Read($request.target)
  if ($request.action -eq 'read') {
    $result = @{ ok = $true; found = ($null -ne $current); payload = $current }
  } elseif ($request.action -eq 'compare-exchange') {
    $stage = 'exchange'
    if (-not [string]::Equals($current, $request.expected, [StringComparison]::Ordinal)) {
      $result = @{ ok = $true; exchanged = $false }
    } else {
      if ($null -eq $request.next) {
        if ($null -ne $current) { [RouteroNativeCredential]::Delete($request.target) }
      } else { [RouteroNativeCredential]::Write($request.target, $request.next) }
      $result = @{ ok = $true; exchanged = $true }
    }
  } else { throw 'invalid-entry' }
  [Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 8))
} catch {
  $errorCode = 'store-unavailable'
  $failure = $_.Exception
  while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
  if ($failure.Message -in @('foreign-entry', 'invalid-entry', 'timeout')) { $errorCode = $failure.Message }
  $nativeError = $null
  if ($failure -is [ComponentModel.Win32Exception]) { $nativeError = $failure.NativeErrorCode }
  [Console]::Out.Write((@{ ok = $false; code = $errorCode; stage = $stage; nativeError = $nativeError; exceptionType = $failure.GetType().FullName } | ConvertTo-Json -Compress))
} finally {
  if ($held) { $mutex.ReleaseMutex() }
  if ($null -ne $mutex) { $mutex.Dispose() }
}
`;
