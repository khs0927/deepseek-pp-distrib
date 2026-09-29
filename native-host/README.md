# DeepSeek++ Native Host

이 디렉터리는 실제 설치된 DeepSeek++ Native Host의 코드와 MCP gateway를 보관한다. 브라우저 확장과 로컬 프로세스 사이의 Native Messaging 경계를 제공한다.

## 제공 도구

- GitHub: github_control
- MCP gateway: mcp_list_servers, mcp_list_tools, mcp_call
- Shell: shell_exec, shell_status, shell_session_begin, shell_session_exec, shell_session_end
- Python: python_status, python_exec
- Local resources: local_skill_preview, local_folder_pick, local_file_stat, local_file_read, local_file_write

총 16개 도구이며, shell/python/file write는 높은 위험도의 로컬 기능이다. 승인된 로컬 작업에서만 사용한다.

## 보안

- process.env 전체를 모델에 전달하지 않는다.
- GitHub 토큰은 소스에 저장하지 않는다.
- 로컬 파일 경로와 내용을 필요한 범위에서만 반환한다.
- Native Host 요청은 길이 제한, timeout, 세션 correlation, 경로 검사를 유지한다.
