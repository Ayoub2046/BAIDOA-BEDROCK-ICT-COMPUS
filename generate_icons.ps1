Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "images\BEDRCOK LOGO.JPG"
$iconsDir = Join-Path $PSScriptRoot "images\icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir -Force
}

$img = [System.Drawing.Image]::FromFile($srcPath)

function Resize-And-Save($size, $outputPath) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Resize-And-Save 192 (Join-Path $iconsDir "icon-192.png")
Resize-And-Save 512 (Join-Path $iconsDir "icon-512.png")
Resize-And-Save 512 (Join-Path $iconsDir "icon-maskable.png")
Resize-And-Save 180 (Join-Path $iconsDir "apple-touch-icon.png")

$img.Dispose()
Write-Host "Real PNG icons successfully generated!"
