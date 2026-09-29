---
name: shell-task-runner
description: Safe, non-blocking execution of shell commands, background tasks, directory inspection, and MCP gateway tools in DeepSeek++.
---

# DeepSeek++ Native Shell & Task Automation Skill

## 1. 사용 가능한 네이티브 도구 체계 (22 Tools)

- **명령 실행**:
  - `shell_exec`: 일반 단발성 명령 실행 (stdout/stderr 반환).
  - `shell_session_begin` / `shell_session_exec` / `shell_session_end`: 환경변수 및 가상환경(venv) 상태가 유지되는 영속적 셸 세션.
- **백그라운드 비차단 작업**:
  - `task_spawn`: 서버 기동, 장기 빌드, 도면 전수 검사 등 장시간 작업 비동기 실행 (task_id 반환).
  - `task_status`: 작업 진행 상태, 종료 코드, 로그 스트림 조회.
  - `task_kill`: 프로세스 트리 안전 종료.
  - `task_list`: 현재 실행/종료된 모든 백그라운드 작업 모니터링.
- **로컬 파일 & 디렉터리 고속 탐색**:
  - `local_dir_list`: 셸 프로세스 시작 없이 디렉터리 목록 JSON 즉시 반환.
  - `local_file_search`: 파일명 패턴(glob) 및 내용 정규식(grep) 고속 탐색.
  - `local_file_read` / `local_file_write`: 안전한 청크 기반 파일 읽기/쓰기.
- **MCP 게이트웨이**:
  - `mcp_list_servers`: 시스템에 등록된 MCP 서버 목록 조회 (`mcp_config.json`).
  - `mcp_list_tools`: 특정 서버(예: `jev`)의 도구 목록 및 파라미터 스키마 조회.
  - `mcp_call`: 등록된 모든 로컬 MCP 도구 원격 호출.
  - `github_control`: 인증된 GitHub CLI 조작.

## 2. 모범 실행 원칙
1. **장기 실행 명령 (10초 이상)**:
   - `shell_exec`로 세션을 블로킹하지 말고, `task_spawn`으로 백그라운드 실행 후 `task_status`로 확인한다.
2. **다단계 빌드/테스트**:
   - 가상환경(venv) 활성화가 필요한 경우 `shell_session_begin`으로 세션을 열어 상태를 유지한다.
3. **위험 명령 실행 전**:
   - 항상 JEV의 `jev_screen` 또는 `jev_decide`를 선행 호출하여 안전성을 검증한다.
