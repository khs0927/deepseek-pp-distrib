---
name: jev-decision
description: Use Jev 1.3 Free (via OpenCode Zen / TypeSafe) for bounded semantic decisions, safety gating, choice routing, risk scoring, claim verification, and probability calibration.
---

# Jev 1.3 System 1 Decision Skill for DeepSeek++ & Antigravity

## 1. 언제 JEV를 호출하는가?
딥식(DeepSeek AI)은 심층 추론, 계획 및 코드 생성(System 2)을 전담하며, 다음 상황에서는 항상 JEV MCP 도구를 호출하여 정량적/확률적 판정(System 1)을 수행합니다:
1. **의사결정 및 분기 라우팅**: 두 가지 이상의 대안 중 하나를 골라야 할 때 (`jev_decide` 또는 `jev_tool_route`)
2. **사실 및 완료 상태 검증**: 도면 좌표, 엔티티 핸들 일치 여부, 테스트 성공 여부를 참/거짓 확률로 검증할 때 (`jev_noul` 또는 `jev_verify`)
3. **위험 스크리닝**: 파괴적이거나 민감한 셸 명령 또는 파일 삭제 전 안전성 사전 점검 (`jev_screen`)

## 2. DeepSeek++에서 호출하는 방법
DeepSeek++에서는 `Shell Local`의 `mcp_call`을 통해 직접 호출합니다:
- `server`: `"jev"`
- `tool`: `"jev_decide"` | `"jev_noul"` | `"jev_verify"` | `"jev_screen"` | `"jev_classify"` | `"jev_rerank"` | `"jev_tool_route"`
- `arguments`: 대상 도구의 파라미터 payload

### 호출 예시:
```json
{
  "server": "jev",
  "tool": "jev_noul",
  "arguments": {
    "state": "DXF 도곽 내 102개 구역 분할 및 BBOX 추출 완료",
    "statement": "Power CAD 계약 규격의 핸들 추출이 정상적이다"
  }
}
```

JEV가 반환한 확률(`probability`)이 0.80 이상일 때 다음 단계로 전진합니다.
