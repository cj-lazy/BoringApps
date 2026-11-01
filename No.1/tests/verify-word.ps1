param(
  [Parameter(Mandatory = $true)][string]$Document,
  [Parameter(Mandatory = $true)][string]$Result,
  [string]$Pdf
)

$ErrorActionPreference = 'Stop'
$docx = (Resolve-Path -LiteralPath $Document).Path
$qaRoot = Split-Path -Parent $docx
$artifacts = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\artifacts')).Path
if (-not $qaRoot.StartsWith($artifacts + '\desktop-qa-', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Only isolated desktop QA documents are allowed'
}
$resultPath = [IO.Path]::GetFullPath($Result)
if (-not $resultPath.StartsWith($qaRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The verification result must stay inside the QA directory'
}
$pdfPath = if ($Pdf) { [IO.Path]::GetFullPath($Pdf) } else { $null }
if ($pdfPath -and -not $pdfPath.StartsWith($qaRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The rendered PDF must stay inside the QA directory'
}

$word = $null
$opened = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $opened = $word.Documents.Open($docx, $false, $true)
  $body = $opened.Content.Text
  $expected = [ordered]@{
    code = $body.Contains('print(')
    entityText = $body.Contains('test')
  }
  $report = [ordered]@{
    opened = $true
    equations = $opened.OMaths.Count
    tables = $opened.Tables.Count
    inlineShapes = $opened.InlineShapes.Count
    expectedText = $expected
    bodyContainsExpectedText = -not ($expected.Values -contains $false)
  }
  $report | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
  if ($report.equations -lt 4) { throw "Expected at least 4 native Word equations, found $($report.equations)" }
  if ($report.tables -lt 1) { throw 'Expected a native Word table' }
  if ($report.inlineShapes -lt 2) { throw 'Expected the diagram and normal image' }
  if (-not $report.bodyContainsExpectedText) { throw 'Expected body text is missing' }
  if ($pdfPath) { $opened.ExportAsFixedFormat($pdfPath, 17) }
} finally {
  if ($opened) { $opened.Close($false); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($opened) }
  if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
