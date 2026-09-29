---
name: power-cad-workflow
description: Complete CAD inspection, layer management, entity query/edit, and visual verification workflow using Power CAD MCP (19 tools).
---

# Power CAD MCP Full Automation Skill

## 1. 도구 체계 (총 19개 도구)
Power CAD MCP는 `CadTools.cs` 및 `CadTools.More.cs`에 정의된 19개의 강력한 도구를 제공합니다:

1. **상태 및 연결 (Connection & State)**
   - `cad_status`: AutoCAD/Simulator 연결 및 도면 기본 상태 점검. (작업 전 필수 호출)
   - `cad_list_targets`: 실행 중인 AutoCAD 인스턴스/세션 목록 조회.
   - `cad_select_target`: 특정 AutoCAD 세션 고정.
   - `cad_inspect`: 도면 리소스(단위, 텍스트 스타일, 치수 스타일, 선종류, 블록, 도면 범위) 정밀 검사.
   - `cad_layers`: 레이어 목록, 색상, 선종류, 동결/잠금 여부 조회.

2. **검색 및 조회 (Query & Inspect)**
   - `cad_query`: 레이어, 타입(LINE, POLYLINE, TEXT, INSERT 등), 텍스트 내용, 윈도우 좌표 범위 기반 엔티티 검색.
   - `cad_get`: 핸들(handle) 목록으로 특정 엔티티의 최신 상태 및 fingerprint 조회.

3. **시각적 검증 및 뷰포트 제어 (Viewport & Verification)**
   - `cad_zoom`: 특정 윈도우 `[[xmin,ymin],[xmax,ymax]]` 또는 엔티티 핸들로 뷰포트 확대/이동.
   - `cad_snapshot`: 지정 구역/엔티티를 렌더링한 Base64 PNG 이미지 획득 (시각적 검증 필수 도구).

4. **수정 및 생성 (Edit & Creation)**
   - `cad_replace_text`: TEXT/MTEXT 문자열 치환.
   - `cad_move`: 엔티티 변위(displacement) 또는 기준점 이동.
   - `cad_modify_opening`: 문/창호/오프닝 블록 크기, 위치, 반전, 속성값 수정.
   - `cad_create`: 선, 폴리라인, 원, 호, 문자, 치수, 해치, 블록 삽입 등 신규 생성.
   - `cad_delete`: 엔티티 삭제.
   - `cad_copy`: 엔티티 복사.
   - `cad_transform`: 배율/회전/미러 변환.
   - `cad_set_layer`: 레이어 생성 및 속성 변경.
   - `cad_set_properties`: 색상, 레이어, 선종류 등 속성 일괄 변경.
   - `cad_batch`: 최대 20개 편집 단계를 단일 트랜잭션으로 원자적(Atomic) 실행 (실패 시 자동 롤백).

## 2. 표준 작업 파이프라인
1. `cad_status` 호출로 현재 연결 확인.
2. `cad_query` 또는 `cad_inspect`로 대상 엔티티 핸들 및 지문(fingerprint) 확보.
3. JEV MCP (`jev_noul` 또는 `jev_screen`)로 수정 계획의 정합성 검증.
4. 수정 작업 실행 (`dry_run=true`로 사전 검증 후 본 작업).
5. `cad_snapshot` 및 `cad_zoom`을 통해 시각적 최종 상태 검증.
