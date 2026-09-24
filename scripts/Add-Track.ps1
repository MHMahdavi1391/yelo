# YELO publisher. Windows PowerShell only. No Python. No Node.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "index.html"))) {
    throw "This script must stay inside the yelo repo."
}

$MusicDir = Join-Path $Root "music"
$PictureDir = Join-Path $Root "picture"
New-Item -ItemType Directory -Force -Path $MusicDir, $PictureDir | Out-Null

function Ask-File($label, $filter) {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = $label
    $dlg.Filter = $filter
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "Canceled."
    }
    return $dlg.FileName
}

$audio = $args | Where-Object { $_ -match '\.(mp3|wav|flac|m4a|ogg|aac|opus)$' } | Select-Object -First 1
$cover = $args | Where-Object { $_ -match '\.(jpg|jpeg|png|webp)$' } | Select-Object -First 1

if (-not $audio) { $audio = Ask-File "MP3 file" "Audio|*.mp3;*.wav;*.flac;*.m4a;*.ogg" }
if (-not $cover) { $cover = Ask-File "Cover image" "Image|*.jpg;*.jpeg;*.png;*.webp" }

if (-not (Test-Path $audio)) { throw "Audio not found: $audio" }
if (-not (Test-Path $cover)) { throw "Cover not found: $cover" }

$base = [IO.Path]::GetFileNameWithoutExtension($audio)
$base = $base.Trim()
if ($base -notmatch '\s-\s') {
    Write-Host "File name should look like: Artist - Title.mp3"
    $artist = Read-Host "Artist"
    $title = Read-Host "Title"
    if (-not $artist -or -not $title) { throw "Artist and title are required." }
    $base = "$artist - $title"
}

$audioDest = Join-Path $MusicDir ($base + [IO.Path]::GetExtension($audio))
$coverDest = Join-Path $PictureDir ($base + [IO.Path]::GetExtension($cover))
Copy-Item -LiteralPath $audio -Destination $audioDest -Force
Copy-Item -LiteralPath $cover -Destination $coverDest -Force

Write-Host "Copied:"
Write-Host "  $audioDest"
Write-Host "  $coverDest"

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Host "Git is not installed. Upload the two files in GitHub: music/ and picture/"
    exit 0
}

Set-Location $Root
git add -- "music" "picture"
$status = git status --porcelain -- "music" "picture"
if (-not $status) {
    Write-Host "Nothing new to commit."
    exit 0
}

git commit -m "Add track $base"
git push
Write-Host "Pushed. GitHub Action will rebuild library.json."
