param(
  [string]$OutputDir = (Join-Path $PSScriptRoot "")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$outerRect = New-Object System.Drawing.RectangleF 20, 20, 216, 216
$shadowRect = New-Object System.Drawing.RectangleF 24, 32, 208, 208
$shadowPath = New-RoundedRectPath -X $shadowRect.X -Y $shadowRect.Y -Width $shadowRect.Width -Height $shadowRect.Height -Radius 54
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(50, 7, 16, 29))
$graphics.FillPath($shadowBrush, $shadowPath)

$backgroundPath = New-RoundedRectPath -X $outerRect.X -Y $outerRect.Y -Width $outerRect.Width -Height $outerRect.Height -Radius 54
$gradientBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point -ArgumentList 20, 20),
  (New-Object System.Drawing.Point -ArgumentList 236, 236),
  ([System.Drawing.Color]::FromArgb(255, 6, 148, 162)),
  ([System.Drawing.Color]::FromArgb(255, 15, 76, 129))
)
$graphics.FillPath($gradientBrush, $backgroundPath)

$glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $backgroundPath
$glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(90, 255, 255, 255)
$glowBrush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
$graphics.FillPath($glowBrush, $backgroundPath)

$shieldPoints = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF -ArgumentList 128, 54),
  (New-Object System.Drawing.PointF -ArgumentList 185, 77),
  (New-Object System.Drawing.PointF -ArgumentList 181, 139),
  (New-Object System.Drawing.PointF -ArgumentList 128, 196),
  (New-Object System.Drawing.PointF -ArgumentList 75, 139),
  (New-Object System.Drawing.PointF -ArgumentList 71, 77)
)
$shieldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(240, 255, 255, 255)), 10
$shieldPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawPolygon($shieldPen, $shieldPoints)

$routePenBack = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 16, 42, 67)), 16
$routePenBack.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$routePenBack.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$routePenBack.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$routePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 245, 235)), 9
$routePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$routePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$routePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$routePoints = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF -ArgumentList 92, 145),
  (New-Object System.Drawing.PointF -ArgumentList 117, 118),
  (New-Object System.Drawing.PointF -ArgumentList 142, 136),
  (New-Object System.Drawing.PointF -ArgumentList 168, 104)
)

$graphics.DrawLines($routePenBack, $routePoints)
$graphics.DrawLines($routePen, $routePoints)

foreach ($point in $routePoints) {
  $outerNodeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 168, 76))
  $innerNodeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 242, 230))
  $graphics.FillEllipse($outerNodeBrush, $point.X - 11, $point.Y - 11, 22, 22)
  $graphics.FillEllipse($innerNodeBrush, $point.X - 4.5, $point.Y - 4.5, 9, 9)
  $outerNodeBrush.Dispose()
  $innerNodeBrush.Dispose()
}

$tunnelPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(185, 255, 255, 255)), 6
$graphics.DrawArc($tunnelPen, 84, 78, 88, 88, 208, 148)
$graphics.DrawArc($tunnelPen, 101, 92, 52, 52, 208, 148)

$highlightPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(55, 255, 255, 255)), 4
$graphics.DrawArc($highlightPen, 38, 34, 160, 120, 195, 56)

[System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null
$pngPath = Join-Path $OutputDir "icon.png"
$icoPath = Join-Path $OutputDir "icon.ico"

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($icoPath)
try {
  $icon.Save($stream)
} finally {
  $stream.Dispose()
  $icon.Dispose()
}

$highlightPen.Dispose()
$tunnelPen.Dispose()
$routePen.Dispose()
$routePenBack.Dispose()
$shieldPen.Dispose()
$glowBrush.Dispose()
$gradientBrush.Dispose()
$shadowBrush.Dispose()
$backgroundPath.Dispose()
$shadowPath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Generated icon assets in $OutputDir"
