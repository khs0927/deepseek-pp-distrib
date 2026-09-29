# setup.ps1 — DeepSeek++ 원클릭 완전 자동 설치 및 환경 설정 스크립트
# 사용법: PowerShell을 열고 `.\setup.ps1` 또는 `powershell -ExecutionPolicy Bypass -File .\setup.ps1` 실행

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [DeepSeek++] 최신 런타임 & Native Host 자동 설치를 시작합니다" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. 경로 설정
$AppDataDeepSeek = Join-Path $env:LOCALAPPDATA "DeepSeek++"
$NativeHostDir = Join-Path $AppDataDeepSeek "NativeHost"
$NativeMessagingHostsDir = Join-Path $AppDataDeepSeek "NativeMessagingHosts"
$UserSkillsDir = Join-Path $env:USERPROFILE ".skills"
$GeminiConfigDir = Join-Path $env:USERPROFILE ".gemini\config"
$McpConfigFile = Join-Path $GeminiConfigDir "mcp_config.json"

# 2. 필수 디렉터리 생성
Write-Host "`n[1/5] 로컬 디렉터리 구조 생성 중..." -ForegroundColor Yellow
@($NativeHostDir, $NativeMessagingHostsDir, $UserSkillsDir, $GeminiConfigDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
        Write-Host "  + 생성됨: $_" -ForegroundColor Gray
    }
}

# 3. NativeHost 파일 복사
Write-Host "`n[2/5] 검증된 NativeHost 런타임 파일 복사 중..." -ForegroundColor Yellow
Copy-Item -Path "$ScriptDir\native-host\*" -Destination $NativeHostDir -Recurse -Force
# wrapper bat 경로를 현재 PC의 LOCALAPPDATA에 맞게 생성
$NodePath = "node.exe"
try {
    $ResolvedNode = (Get-Command node -ErrorAction Stop).Source
    $NodePath = $ResolvedNode
} catch {
    Write-Host "  ! 경고: PATH에서 node.exe를 찾지 못했습니다. 기본 경로를 사용합니다." -ForegroundColor Red
}

$BatContent = @"
@echo off
set "DPP_LOG_FILE=$NativeHostDir\native-host.log"
"$NodePath" "$NativeHostDir\shell-mcp-host.mjs" %*
"@
Set-Content -Path "$NativeHostDir\shell-mcp-host.bat" -Value $BatContent -Encoding ASCII
Write-Host "  + $NativeHostDir\shell-mcp-host.bat 생성 완료 (Node: $NodePath)" -ForegroundColor Green

# 4. Manifest 파일 생성 (Chrome / Edge / Aside / Chromium 호환)
Write-Host "`n[3/5] 브라우저 Native Messaging Manifest 생성 중..." -ForegroundColor Yellow
$ExtId = "kdmpkkahkhdmdhfkdihkopikgcocbpbf"
$ManifestTemplate = @{
    name = "com.deepseek_pp.shell"
    description = "DeepSeek++ Shell MCP - General purpose shell execution via Native Messaging"
    path = "$NativeHostDir\shell-mcp-host.bat"
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtId/")
} | ConvertTo-Json -Depth 4

$ChromeManifest = Join-Path $NativeMessagingHostsDir "com.deepseek_pp.shell.chrome.json"
$EdgeManifest = Join-Path $NativeMessagingHostsDir "com.deepseek_pp.shell.edge.json"
Set-Content -Path $ChromeManifest -Value $ManifestTemplate -Encoding UTF8
Set-Content -Path $EdgeManifest -Value $ManifestTemplate -Encoding UTF8
Write-Host "  + Manifest 파일 생성 완료: $ChromeManifest" -ForegroundColor Green

# 5. 브라우저 레지스트리 일괄 등록
Write-Host "`n[4/5] 브라우저별 레지스트리 자동 등록 중 (Chrome, Edge, Aside, Chromium)..." -ForegroundColor Yellow
$RegistryKeys = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.deepseek_pp.shell",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.deepseek_pp.shell",
    "HKCU:\Software\Chromium\NativeMessagingHosts\com.deepseek_pp.shell",
    "HKCU:\Software\Aside\NativeMessagingHosts\com.deepseek_pp.shell"
)

foreach ($regKey in $RegistryKeys) {
    if (-not (Test-Path $regKey)) {
        New-Item -Path $regKey -Force | Out-Null
    }
    Set-ItemProperty -Path $regKey -Name "(default)" -Value $ChromeManifest
    Write-Host "  + 등록 완료: $regKey" -ForegroundColor Green
}

# 6. .skills 동기화
Write-Host "`n[5/5] 전문 스킬(.skills) 배포 중..." -ForegroundColor Yellow
Copy-Item -Path "$ScriptDir\skills\*" -Destination $UserSkillsDir -Recurse -Force
Get-ChildItem -Path $UserSkillsDir | ForEach-Object {
    Write-Host "  + 스킬 활성화: $($_.Name)" -ForegroundColor Green
}

# 7. mcp_config.json 기본 템플릿 검사
if (-not (Test-Path $McpConfigFile)) {
    $DefaultMcpConfig = @{
        mcpServers = @{
            jev = @{
                command = "node"
                args = @("C:\Users\khs09\.local\bin\jev-mcp-server.mjs")
                env = @{}
            }
        }
    } | ConvertTo-Json -Depth 5
    Set-Content -Path $McpConfigFile -Value $DefaultMcpConfig -Encoding UTF8
    Write-Host "  + 기본 mcp_config.json 생성됨" -ForegroundColor Gray
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " [완료] DeepSeek++ 셋업이 성공적으로 끝났습니다!" -ForegroundColor Green
Write-Host " - 브라우저(Aside/Chrome/Edge) 확장 관리자에서 extension 폴더를 '압축해제된 확장'으로 로드하세요." -ForegroundColor White
Write-Host " - 브라우저 우측 패널의 MCP > Shell Local 카드에서 [Test] -> [Refresh tools]를 누르면 끝납니다." -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
