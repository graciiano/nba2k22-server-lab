param([string]$Pattern='.', [int]$Last=60, [int]$Width=320, [switch]$Compact)
# Mostra linhas da última sessão do game-log.txt que casam com o padrão.
# -Compact: mostra só tick, função e os valores u32 dos argumentos.
$l = Get-Content (Join-Path $PSScriptRoot 'game-log.txt') -Tail 800000
$i = ($l | Select-String '^---- game-log' | Select-Object -Last 1).LineNumber
$s = $l[($i-1)..($l.Count-1)]
$s | Select-String -Pattern $Pattern | Select-Object -Last $Last | ForEach-Object {
  $t = $_.Line
  if ($Compact) {
    $head = ($t -split ' ')[0..3] -join ' '
    $vals = ([regex]::Matches($t, 'u32=(\w+)') | ForEach-Object { $_.Groups[1].Value }) -join ' '
    $str = ([regex]::Matches($t, ' [wsi]+="([^"]*)"') | ForEach-Object { $_.Groups[1].Value }) -join ' | '
    $t = "$head :: $vals $str"
  }
  if ($t.Length -gt $Width) { $t = $t.Substring(0,$Width) }
  $t
}
