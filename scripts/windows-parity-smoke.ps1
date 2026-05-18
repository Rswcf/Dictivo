param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [string]$ExpectedVersion = "",

  [int]$LaunchWaitSeconds = 8,

  [switch]$StopAfterLaunch
)

$ErrorActionPreference = "Stop"

function Assert-WindowsHost {
  $isWindowsHost = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows
  )
  if (-not $isWindowsHost) {
    throw "Run this smoke script from Windows."
  }
}

function Resolve-ExpectedVersion {
  if ($ExpectedVersion.Trim().Length -gt 0) {
    return $ExpectedVersion.Trim()
  }

  $configPath = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\tauri.conf.json"
  if (-not (Test-Path $configPath)) {
    throw "ExpectedVersion was not provided and $configPath was not found."
  }

  $config = Get-Content $configPath | ConvertFrom-Json
  if (-not $config.version) {
    throw "Could not read version from $configPath."
  }

  return [string]$config.version
}

function Find-DictivoExe {
  $installRoots = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Dictivo"),
    (Join-Path $env:LOCALAPPDATA "Dictivo"),
    (Join-Path $env:ProgramFiles "Dictivo")
  )

  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($programFilesX86) {
    $installRoots += (Join-Path $programFilesX86 "Dictivo")
  }

  foreach ($root in $installRoots) {
    $candidate = Join-Path $root "Dictivo.exe"
    if (Test-Path $candidate) {
      return Get-Item $candidate
    }
  }

  $programsRoot = Join-Path $env:LOCALAPPDATA "Programs"
  if (Test-Path $programsRoot) {
    return Get-ChildItem -Path $programsRoot -Filter "Dictivo.exe" -Recurse -File -ErrorAction SilentlyContinue |
      Select-Object -First 1
  }

  return $null
}

function Stop-DictivoProcesses {
  Get-Process -Name "Dictivo" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

Assert-WindowsHost

$version = Resolve-ExpectedVersion
$installer = Get-Item $InstallerPath
$expectedInstallerName = "Dictivo_${version}_x64-setup.exe"

if ($installer.Name -ne $expectedInstallerName) {
  throw "Installer '$($installer.Name)' does not match expected '$expectedInstallerName'."
}

$signaturePath = "$($installer.FullName).sig"
if (-not (Test-Path $signaturePath)) {
  throw "Missing updater signature next to installer: $signaturePath"
}

Write-Host "Stopping existing Dictivo processes..."
Stop-DictivoProcesses

Write-Host "Installing $($installer.FullName)..."
$install = Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait -PassThru
if ($install.ExitCode -ne 0) {
  throw "NSIS installer failed with exit code $($install.ExitCode)."
}

$installedExe = Find-DictivoExe
if (-not $installedExe) {
  throw "Dictivo.exe was not found after install."
}
if ($installedExe.Length -le 0) {
  throw "Installed Dictivo.exe is empty."
}

$installedProductVersion = $installedExe.VersionInfo.ProductVersion
if (-not $installedProductVersion) {
  throw "Installed Dictivo.exe is missing ProductVersion metadata."
}
if ($installedProductVersion -notlike "$version*") {
  throw "Installed Dictivo.exe ProductVersion '$installedProductVersion' does not match expected version $version."
}

Write-Host "Installed $($installedExe.FullName) ($($installedExe.Length) bytes)."
Write-Host "Installed Dictivo.exe ProductVersion $installedProductVersion."

$launched = Start-Process -FilePath $installedExe.FullName -PassThru
Start-Sleep -Seconds $LaunchWaitSeconds
$running = Get-Process -Name "Dictivo" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $running) {
  $exitDetail = if ($launched.HasExited) { " It exited with code $($launched.ExitCode)." } else { "" }
  throw "Dictivo did not remain running during launch smoke.$exitDetail"
}

Write-Host "Launch smoke passed. Dictivo process $($running.Id) is running."

if ($StopAfterLaunch) {
  Stop-DictivoProcesses
  Write-Host "Stopped Dictivo after launch smoke."
} else {
  Write-Host "Dictivo is still running. Continue with WIN-PARITY-002 through WIN-PARITY-020."
}
