#Requires -Version 5.1
$url = 'https://huggingface.co/FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx/resolve/main/model.onnx'
$r = Invoke-WebRequest -Method Head -Uri $url -MaximumRedirection 5
$len = [int64]$r.Headers['Content-Length']
Write-Host "OK: $url status=$($r.StatusCode) bytes=$len"
if ($len -lt 1000000000) {
  Write-Error "model.onnx too small: $len"
}
