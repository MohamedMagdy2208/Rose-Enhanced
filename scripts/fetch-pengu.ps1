$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vendorRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'vendor'))
$target = [System.IO.Path]::GetFullPath((Join-Path $vendorRoot 'PenguLoader-1.1.6'))
$expectedCommit = '4d641f52bc5d70aac4c09dfa1fa7a043a9069aff'
$repository = 'https://github.com/PenguLoader/PenguLoader.git'

if (-not $target.StartsWith($vendorRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a vendor path outside the workspace: $target"
}

New-Item -ItemType Directory -Force -Path $vendorRoot | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $target '.git'))) {
  git clone --filter=blob:none --no-checkout $repository $target
}

git -C $target fetch --depth 1 origin $expectedCommit
git -C $target checkout --detach $expectedCommit
$actualCommit = (git -C $target rev-parse HEAD).Trim()

if ($actualCommit -ne $expectedCommit) {
  throw "Pengu Loader pin mismatch. Expected $expectedCommit, received $actualCommit."
}

Write-Host "Pengu Loader v1.1.6 is pinned at $actualCommit"
