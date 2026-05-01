# Release dev ports used by invention_writer (8000 API, 5173 Vite).
# Optional -CloseHostWindows: terminate cmd wrappers that run run-backend/run-frontend
# (WMI CommandLine match). taskkill.exe is intentionally NOT used — many locked-down PCs
# block it with "액세스가 거부되었습니다" / access denied.
#
# May stop other apps if they listen on these ports — intended for local dev launcher.

param(
    [switch] $CloseHostWindows
)

$ports = @(8000, 5173)
$pidsSeen = New-Object System.Collections.Generic.HashSet[int]

foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { continue }
    foreach ($c in $conns) {
        # Never assign to $pid — PowerShell automatic (current shell).
        $owningPid = $c.OwningProcess
        if ($pidsSeen.Add($owningPid)) {
            try {
                Stop-Process -Id $owningPid -Force -ErrorAction Stop
                Write-Host "[free-dev-ports] stopped PID $owningPid on port $port"
            }
            catch {
                Write-Host "[free-dev-ports] could not stop PID $owningPid : $($_.Exception.Message)"
            }
        }
    }
}

if (-not $CloseHostWindows) {
    exit 0
}

# Spawned wrappers: START "invention_writer …" cmd /c call …run-backend.cmd
try {
    Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $cl = $_.CommandLine
            if (-not $cl) { return $false }
            ($cl -like '*run-backend.cmd*') -or ($cl -like '*run-frontend.cmd*')
        } |
        ForEach-Object {
            try {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
                Write-Host "[free-dev-ports] stopped cmd PID $($_.ProcessId) launcher wrapper"
            }
            catch {}
        }
}
catch {}
