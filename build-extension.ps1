# eAI VS Code Extension Build Script

Write-Host "[*] Starting eAI Extension Build Process..." -ForegroundColor Cyan

# 1. Install dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Installing npm dependencies..."
    npm install
}

# 2. Compile TypeScript
Write-Host "[*] Compiling TypeScript..."
npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Compilation failed!" -ForegroundColor Red
    exit 1
}

# 3. Package Extension
Write-Host "[*] Packaging extension to VSIX..."
if (-not (Get-Command "vsce" -ErrorAction SilentlyContinue)) {
    Write-Host "[!] vsce not found. Installing globally..."
    npm install -g @vscode/vsce
}

vsce package --out eAI.vsix
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Packaging failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[+] Success! Extension built: eAI.vsix" -ForegroundColor Green
Write-Host "[*] Install with: code --install-extension eAI.vsix --force"
