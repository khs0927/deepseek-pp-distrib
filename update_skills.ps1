# update_skills.ps1 — .skills 폴더 변경사항을 배포 저장소에 즉시 동기화하는 스크립트
# 사용법: 새로운 스킬을 추가하거나 수정한 뒤 이 스크립트를 더블클릭하거나 실행하면 자동으로 동기화됩니다.

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$UserSkillsDir = Join-Path $env:USERPROFILE ".skills"
$RepoSkillsDir = Join-Path $ScriptDir "skills"

if (-not (Test-Path $UserSkillsDir)) {
    Write-Host "로컬 스킬 폴더가 없습니다: $UserSkillsDir" -ForegroundColor Red
    exit 1
}

Write-Host "스킬 동기화 시작: $UserSkillsDir -> $RepoSkillsDir" -ForegroundColor Cyan
Copy-Item -Path "$UserSkillsDir\*" -Destination $RepoSkillsDir -Recurse -Force

Write-Host "현재 배포 저장소에 반영된 스킬 목록:" -ForegroundColor Green
Get-ChildItem -Path $RepoSkillsDir | ForEach-Object {
    Write-Host "  - $($_.Name)" -ForegroundColor Yellow
}

Write-Host "`n동기화 완료! 이제 git add, commit, push를 진행하시면 원격 GitHub에 즉시 업데이트됩니다." -ForegroundColor Green
