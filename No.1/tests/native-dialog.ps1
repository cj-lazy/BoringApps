param(
    [Parameter(Mandatory=$true)][string]$Executable,
    [ValidateSet('Inspect','Save')][string]$Action = 'Inspect',
    [string]$Destination
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class QaDialogWindows {
  public delegate bool Callback(IntPtr handle, IntPtr state);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr window, Callback callback, IntPtr state);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder value, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder value, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, string value);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$resolvedExe = (Resolve-Path -LiteralPath $Executable).Path
$qaRoot = Split-Path -Parent $resolvedExe
$artifacts = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../artifacts'))
if (-not $qaRoot.StartsWith($artifacts + '\desktop-qa-', [StringComparison]::OrdinalIgnoreCase)) { throw 'Only isolated QA applications are allowed' }
if ($Action -eq 'Save') {
    $target = [IO.Path]::GetFullPath($Destination)
    if (-not $target.StartsWith($qaRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Export must remain in the QA directory' }
    if (Test-Path -LiteralPath $target) { throw 'Refusing to overwrite an existing export' }
}
$process = Get-CimInstance Win32_Process -Filter "Name='portable-note.exe'" | Where-Object { $_.ExecutablePath -eq $resolvedExe } | Select-Object -First 1
if (-not $process) { throw 'Isolated QA process not found' }
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$process.ProcessId)
$deadline = [DateTime]::UtcNow.AddSeconds(20)
do {
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
    $dialog = $null
    foreach ($window in $windows) {
        if ($window.Current.ClassName -eq '#32770') { $dialog = $window; break }
        $nested = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($item in $nested) { if ($item.Current.ClassName -eq '#32770') { $dialog = $item; break } }
        if ($dialog) { break }
    }
    if (-not $dialog) { Start-Sleep -Milliseconds 200 }
} until ($dialog -or [DateTime]::UtcNow -gt $deadline)
if (-not $dialog) { throw 'Native dialog did not appear' }
$nativeControls = [Collections.Generic.List[object]]::new()
$callback = [QaDialogWindows+Callback] {
    param($handle, $state)
    $name = [Text.StringBuilder]::new(512); $class = [Text.StringBuilder]::new(128)
    [void][QaDialogWindows]::GetWindowText($handle,$name,512)
    [void][QaDialogWindows]::GetClassName($handle,$class,128)
    if ($class.ToString() -in @('Edit','ComboBox','Button','#32770')) {
        $nativeControls.Add([pscustomobject]@{ Handle=$handle.ToInt64(); Id=[QaDialogWindows]::GetDlgCtrlID($handle); Name=$name.ToString(); Class=$class.ToString() })
    }
    return $true
}
[void][QaDialogWindows]::EnumChildWindows([IntPtr]$dialog.Current.NativeWindowHandle,$callback,[IntPtr]::Zero)
if ($Action -eq 'Inspect') {
    $nativeControls | ConvertTo-Json -Depth 3
    exit
}
$filename = @($nativeControls | Where-Object { $_.Class -eq 'Edit' -and $_.Id -eq 1001 })
$saveButton = @($nativeControls | Where-Object { $_.Class -eq 'Button' -and $_.Id -eq 1 })
if ($filename.Count -ne 1 -or $saveButton.Count -ne 1) { throw 'Unexpected save dialog controls' }
[void][QaDialogWindows]::SendMessage([IntPtr]$filename[0].Handle, 0x000C, [IntPtr]::Zero, $target)
if (-not [QaDialogWindows]::PostMessage([IntPtr]$saveButton[0].Handle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)) { throw 'Unable to confirm export' }
Write-Output 'Confirmed export destination in isolated QA directory'
