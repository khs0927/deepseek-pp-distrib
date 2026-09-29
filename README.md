# DeepSeek++ Portable All-in-One Distribution

이 저장소는 **DeepSeek++ 브라우저 확장 프로그램**, **오류가 완벽히 수정된 22개 도구 지원 Native Host**, 그리고 **JEV / Power CAD / Shell Task 3대 전문 스킬(.skills)**을 다른 어떤 윈도우 PC에서도 원클릭으로 즉시 설치하고 사용할 수 있도록 패키징한 올인원 배포판입니다.

---

## 📂 폴더 구조

```text
deepseek-pp-distrib/
├── extension/          # 브라우저에 등록할 최신 DeepSeek++ 빌드본 (Chrome/Edge/Aside MV3)
├── native-host/        # 검증 완료된 22개 도구 내장 Native Host 런타임
├── skills/             # 3대 전문 스킬 (jev-decision, power-cad-workflow, shell-task-runner)
├── setup.ps1           # 다른 PC에서 1초 만에 모든 환경을 구성해주는 원클릭 파워셸 설치 스크립트
├── update_skills.ps1   # 내 PC의 .skills 변경사항을 이 저장소로 즉시 가져오는 동기화 스크립트
└── README.md
```

---

## ⚡ 새 컴퓨터(다른 PC)에서 1분 만에 설치하는 방법

### 1단계: 저장소 클론 (또는 다운로드)
```powershell
git clone https://github.com/사용자아이디/저장소이름.git
cd 저장소이름
```

### 2단계: 원클릭 설치 스크립트 실행
PowerShell 관리자 권한(또는 일반 권한)에서 다음 명령 한 줄만 실행합니다:
```powershell
.\setup.ps1
```
* **자동 수행 작업**:
  - `LOCALAPPDATA\DeepSeek++\NativeHost` 및 `NativeMessagingHosts` 자동 생성 및 복사
  - 현재 PC 환경에 맞게 `shell-mcp-host.bat` 래퍼 자동 생성
  - Chrome, Edge, Aside, Chromium 등 모든 브라우저 레지스트리 일괄 자동 등록
  - 사용자 홈 디렉터리의 `.skills` 폴더에 최신 3대 스킬 자동 배포

### 3단계: 브라우저에 확장 프로그램 로드
1. Aside, Chrome 또는 Edge의 확장 프로그램 관리자(`chrome://extensions` 또는 `edge://extensions`) 접속
2. **개발자 모드 (Developer mode)** 활성화
3. **[ 압축해제된 확장 프로그램을 로드합니다 (Load unpacked) ]** 클릭
4. 이 폴더 안의 **`extension`** 폴더를 선택!

### 4단계: 연결 확인
1. 브라우저 우측 **DeepSeek++ 사이드패널** 열기
2. **Capabilities > MCP > Shell Local** 카드에서 **[ Test ]** 클릭 ➔ 즉시 초록색 `connected`
3. **[ Refresh tools ]** 클릭 ➔ `22 tools`가 정상 로드되면 끝!

---

## 🔄 스킬을 추가하거나 수정했을 때 (업데이트 방법)

앞으로 로컬 PC의 `.skills` 폴더에 새 스킬을 추가하거나 프롬프트를 고친 뒤 다른 PC에도 공유하고 싶을 때는:

1. **동기화 스크립트 실행**:
   ```powershell
   .\update_skills.ps1
   ```
   (로컬의 `.skills` 변경사항이 이 저장소의 `skills/` 폴더로 자동 복사됩니다.)
2. **깃허브에 푸시**:
   ```powershell
   git add .
   git commit -m "Update skills"
   git push
   ```
3. **다른 PC에서 업데이트 받기**:
   ```powershell
   git pull
   .\setup.ps1
   ```
   (새로운 스킬이 다른 PC의 `.skills` 폴더로 즉시 동기화됩니다.)
