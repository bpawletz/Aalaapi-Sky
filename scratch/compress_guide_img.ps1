Add-Type -AssemblyName System.Drawing

$srcPath = "C:/Users/bpawl/.gemini/antigravity-ide/brain/4986aae7-0c57-47c3-b5e0-5d262d565e79/rc2_options_guide_1787863184507.jpg"
$destPath = "C:/Users/bpawl/OneDrive/code/Aalaapi-Sky/scratch/rc2_options_guide_opt.jpg"

$srcImg = [System.Drawing.Image]::FromFile($srcPath)

# Target width 1000px, preserve aspect ratio
$newWidth = 1000
$newHeight = [int]($srcImg.Height * ($newWidth / $srcImg.Width))

$destImg = New-Object System.Drawing.Bitmap($newWidth, $newHeight)
$graphics = [System.Drawing.Graphics]::FromImage($destImg)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.DrawImage($srcImg, 0, 0, $newWidth, $newHeight)

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]80)

$destImg.Save($destPath, $jpegCodec, $encoderParams)

$graphics.Dispose()
$destImg.Dispose()
$srcImg.Dispose()

$fileInfo = Get-Item $destPath
Write-Output "Optimized size: $($fileInfo.Length) bytes ($([math]::Round($fileInfo.Length / 1024)) KB)"
