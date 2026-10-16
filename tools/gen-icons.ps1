# FocusPlanet 图标生成脚本
# 使用 Windows 自带的 System.Drawing 生成 16 / 48 / 128 三种尺寸的 PNG 图标。
# 在 PowerShell 中运行：  .\tools\gen-icons.ps1
# 生成结果输出到 icons\icon16.png、icon48.png、icon128.png

Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $scriptDir "..\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-PlanetIcon {
    param(
        [int]$Size,
        [string]$Path
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # 1) 背景：深蓝 -> 青色 对角渐变
    $rect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 11, 16, 38),
        [System.Drawing.Color]::FromArgb(255, 14, 165, 233),
        [single]45.0)
    $g.FillRectangle($bgBrush, $rect)

    # 2) 星球环（在星球后方）
    $ringWidth = [single]([Math]::Max(1.0, $Size * 0.04))
    $ringPen = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(180, 125, 211, 252),
        $ringWidth)
    $rx = [single]($Size * 0.14)
    $ry = [single]($Size * 0.42)
    $rw = [single]($Size * 0.72)
    $rh = [single]($Size * 0.26)
    $ringRect = [System.Drawing.RectangleF]::new($rx, $ry, $rw, $rh)
    $g.DrawEllipse($ringPen, $ringRect)

    # 3) 星球主体（青色圆）
    $planetPad = [single]($Size * 0.26)
    $planetDiam = [single]($Size - (2 * $Size * 0.26))
    $planetRect = [System.Drawing.RectangleF]::new($planetPad, $planetPad, $planetDiam, $planetDiam)
    $planetBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
    $g.FillEllipse($planetBrush, $planetRect)

    # 4) 星球高光
    $hx = [single]($Size * 0.38)
    $hy = [single]($Size * 0.32)
    $hw = [single]($Size * 0.18)
    $hh = [single]($Size * 0.12)
    $hlBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 255, 255, 255))
    $hlRect = [System.Drawing.RectangleF]::new($hx, $hy, $hw, $hh)
    $g.FillEllipse($hlBrush, $hlRect)

    # 5) 星星点缀
    $starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $starR = [single]([Math]::Max(1.0, $Size * 0.015))
    $starPoints = @(
        [System.Drawing.PointF]::new([single]($Size * 0.16), [single]($Size * 0.18)),
        [System.Drawing.PointF]::new([single]($Size * 0.82), [single]($Size * 0.14)),
        [System.Drawing.PointF]::new([single]($Size * 0.20), [single]($Size * 0.80)),
        [System.Drawing.PointF]::new([single]($Size * 0.84), [single]($Size * 0.78)),
        [System.Drawing.PointF]::new([single]($Size * 0.52), [single]($Size * 0.10))
    )
    foreach ($pt in $starPoints) {
        $sr = [System.Drawing.RectangleF]::new(
            [single]($pt.X - $starR / 2),
            [single]($pt.Y - $starR / 2),
            $starR,
            $starR)
        $g.FillEllipse($starBrush, $sr)
    }

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

New-PlanetIcon -Size 16  -Path (Join-Path $outDir "icon16.png")
New-PlanetIcon -Size 48  -Path (Join-Path $outDir "icon48.png")
New-PlanetIcon -Size 128 -Path (Join-Path $outDir "icon128.png")

Write-Host "Icons generated in $outDir"
