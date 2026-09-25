# Download missing ComfyUI models for pet sprite pipeline (uses system proxy)
$ErrorActionPreference = "Stop"
$Proxy = "http://127.0.0.1:22307"
$Root = "L:\ai\comfy\ComfyUI-aki-v2\ComfyUI"

$jobs = @(
  @{
    Out = "$Root\models\clip_vision\CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
    Url = "https://hf-mirror.com/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors"
    MinMB = 2300
  },
  @{
    Out = "$Root\models\ipadapter\ip-adapter-plus_sdxl_vit-h.safetensors"
    Url = "https://hf-mirror.com/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors"
    MinMB = 700
  },
  @{
    Out = "$Root\models\controlnet\control-lora-openposeXL2-rank256.safetensors"
    Url = "https://huggingface.co/thibaud/controlnet-openpose-sdxl-1.0/resolve/main/control-lora-openposeXL2-rank256.safetensors"
    MinMB = 700
  }
)

function Need-Download($path, $minMB) {
  if (-not (Test-Path $path)) { return $true }
  $mb = (Get-Item $path).Length / 1MB
  return ($mb -lt $minMB)
}

foreach ($j in $jobs) {
  $dir = Split-Path $j.Out -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  if (-not (Need-Download $j.Out $j.MinMB)) {
    Write-Host "OK skip $($j.Out)"
    continue
  }
  Write-Host "Downloading $($j.Url) -> $($j.Out)"
  & curl.exe -L --retry 5 --retry-delay 3 -x $Proxy -C - -o $j.Out $j.Url
  if ($LASTEXITCODE -ne 0) { throw "curl failed for $($j.Out)" }
}

Write-Host "All downloads finished. Restart ComfyUI if models are not listed."
