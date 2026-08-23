$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$project = Join-Path $repositoryRoot 'vendor\PenguLoader-1.1.6\loader\loader.csproj'
$buildRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'build\pengu-loader'))
$workspaceBuildRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'build'))

if (-not (Test-Path -LiteralPath $project)) {
  throw 'Pengu Loader source is missing. Run npm run vendor:pengu first.'
}
if (-not $buildRoot.StartsWith($workspaceBuildRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to build outside the workspace build folder: $buildRoot"
}

$msbuild = $env:MSBUILD_EXE
if (-not $msbuild) {
  $command = Get-Command msbuild -ErrorAction SilentlyContinue
  if ($command) { $msbuild = $command.Source }
}
if (-not $msbuild) {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path -LiteralPath $vswhere) {
    $msbuild = & $vswhere -latest -products '*' -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
  }
}
if (-not $msbuild -or -not (Test-Path -LiteralPath $msbuild)) {
  throw 'MSBuild was not found. Install Visual Studio .NET desktop build tools or set MSBUILD_EXE.'
}

if (Test-Path -LiteralPath $buildRoot) {
  $resolved = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $buildRoot).Path)
  if (-not $resolved.StartsWith($workspaceBuildRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean an unexpected build folder: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null

& $msbuild $project /t:Restore,Build /m /v:minimal /p:Configuration=Release /p:Platform=AnyCPU "/p:OutputPath=$buildRoot\" /p:SignAssembly=false /p:UseSharedCompilation=false /p:NuGetAudit=false /p:RestoreIgnoreFailedSources=true
if ($LASTEXITCODE -ne 0) { throw "Pengu Loader build failed with exit code $LASTEXITCODE." }

$executable = Join-Path $buildRoot 'Pengu Loader.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw "Build did not produce $executable" }
Write-Host "Built Pengu Loader at $executable"
