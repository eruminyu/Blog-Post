---
title: 임민성 | 게임 개발 포트폴리오
created: 2026-09-30
updated: 2026-10-12
published: 2026-10-02
description: C++ 콘솔 게임 2편을 플레이 GIF로 보여 주고, 본인과 AI의 구현 범위와 문제 해결 과정을 정리한 포트폴리오입니다.
image: ""
tags:
  - Portfolio
  - C++
  - 게임개발
category: Portfolio
draft: false
aliases:
  - 포트폴리오
---

| **임민성** · 1996년생 (만 30세) · **신입 게임 클라이언트 개발** 지원 |
| --- |
| [arisia427@gmail.com](mailto:arisia427@gmail.com) · 010-4335-9760 · [GitHub](https://github.com/eruminyu) · [블로그](https://blog.serian.live) |
| **경력:** 하나로호스팅 시스템 엔지니어 (2024.08 ~ 2026.06) · 처리 티켓 **740건 이상** (업무 이력 기록 기준) · [이력서 보기](https://blog.serian.live/posts/01_blog_posts/%EC%9D%B4%EB%A0%A5%EC%84%9C/) |
| **교육:** 원티드 포텐업 게임개발 5기 (2026.07.27 ~ 2027.01 예정, 진행 중) |
| **핵심 기술:** C++20 · Windows API · Windows Console·Terminal · Unreal Engine (학습 중) |

**바로가기:** [[#프로젝트|프로젝트]] · [[#문제를 해결한 방식|문제 해결]] · [[#그 밖의 프로젝트|그 밖의 프로젝트]] · [[#기술|기술]]

***

## 프로젝트

<!-- PORTFOLIO_PROJECTS_START -->
%% Obsidian에서는 Base 갤러리 카드(대표 GIF 포함)로 보이고, 블로그에서는 같은 속성으로 만든 프로젝트 요약으로 바뀝니다. 요약·역할·대표 GIF는 각 프로젝트 노트의 portfolio_summary, role, portfolio_cover 속성에서 고치세요. %%

![[08_Base/프로젝트 리스트.base#포트폴리오]]
<!-- PORTFOLIO_PROJECTS_END -->

***

## 문제를 해결한 방식

### 출력 문자열 조립 병목 (Console Zombie)

**AI와 함께 출력 문자열 조립 평균을 54.56ms에서 3.02ms로, 약 94.5% 줄였습니다.**

셀마다 문자열 객체를 만들던 `ComposeFrame`을, 재사용 버퍼에 쓰고 색이 바뀔 때만 색상 코드를 넣도록 바꿨습니다(구현 Claude Code, 벤치마크 재현 Codex).

측정 조건: Debug x64 · 동일 합성 입력 540×136셀 · 예열 30회 후 200회 측정 · CPU 측 함수만(터미널 표시 시간 제외)

### 디버그 뷰 (Console Zombie)

**플레이 결과를 검토해 밸런스 수정을 요청했습니다.**

![[01_Blog_Posts/_Assets/portfolio/consolezombie-2.gif|640]]

소음 히트맵과 A\* 경로를 보여 주는 디버그 화면입니다. 디버그 뷰와 밸런스 설정 파일(`GameBalance.ini` 69개 항목) F5 재로드 구현은 Claude Code가 맡았습니다.

### 그룹 단위 낙하 (Mr.Driller-C)

**AI 도움을 받아, 블록마다 따로 하던 낙하 판정을 연결 그룹 단위로 바꿨습니다.**

덩어리가 흩어지던 문제를, 연결 그룹 전체가 내려갈 수 있을 때만 함께 떨어지게 해 해결했습니다.

%% 근거: 그룹 낙하는 첫 콘솔 게임 제작 프로젝트 보고서의 이슈 1, 본인 구현과 AI 도움 범위는 발표 Q&A 기준입니다. %%

***

## 그 밖의 프로젝트

- **[Rookery](https://github.com/eruminyu/Rookery)** (2026.02 ~ 2026.09) · 라이브 방송 자동 녹화 도구, 실제 녹화에 사용 중 · 18MB·12만 줄 채팅 로그의 1페이지 조회 **233ms → 0.5ms** (104MB·32개 파일 아카이브 환경)
- **[Tanya](https://github.com/eruminyu/tanya-project)** (2026.03 ~ 2026.09) · 승인한 일정만 캘린더에 만드는 Live2D AI 동반자 웹 데모 · [공개 데모](https://tanya.serian.live)

두 프로젝트 모두 방향·검증은 제가, 구현·테스트(Tanya는 설계 문서 포함)는 Claude Code·Codex가 맡았습니다.

***

## 기술

- **언어·도구:** C++20 · Visual Studio (MSVC) · Git·GitHub · Claude Code·Codex
- **콘솔·게임 로직:** Windows Console·Terminal · Windows API · 연결 그룹 탐색 (Mr.Driller-C)
- **AI 구현·본인 검토:** DDA 레이캐스팅 · 쿼드트리 맵 생성 · A\* · GDI·XAudio2 (Console Zombie)
- **학습 중:** Unreal Engine · Blueprint · C++ 연동

<!-- PORTFOLIO_EDITOR_START -->
## 작성·발행 관리

%% 이 구역은 블로그 본문에서는 빠지지만 RSS 피드와 GitHub 원본에는 보입니다. %%

> [!note]- 피드백 반영 내역 (2026-10-12)
>
> - **핵심 먼저:** 맨 위에 이름·나이·연락처·경력·교육·핵심 기술 카드, 바로 아래 바로가기 (소개 callout은 삭제)
> - **GIF:** 두 프로젝트 노트의 `portfolio_cover`를 GIF로 연결(Console Zombie는 좀비 추격 장면, Mr.Driller-C는 직접 조작한 MANUAL 장면). 문제 해결에는 디버그 뷰 GIF
> - **문제 해결:** 절마다 결론 한 줄 → 짧은 근거. 측정 수치는 조건과 함께, AI 몫은 같은 절 안에 표기
> - **그 밖의 프로젝트:** Rookery·Tanya를 이력서와 같은 한 줄 불릿으로 줄임 (커버 이미지 제외)
> - **프로젝트 속성:** Console Zombie `portfolio_summary`에 AI 협업과 측정 수치를 넣고, Mr.Driller-C `portfolio_summary`는 게임 규칙 설명으로 바꾸고 `role`에 본인 구현·AI 도움 범위를 반영

> [!todo]- 발행 전 확인
>
> - [ ] push 전에 [[08_Base/이력서·포트폴리오 작성 가드레일]] §5 'push 순서'를 따르기 (로컬 Vault가 원격보다 뒤처져 있어 그냥 `git pull`하면 멈춤)
> - [ ] Study/취업 이동은 이력서·Portfolio 수정과 같은 push에 포함 (두 프로젝트 노트의 `project_url`이 /study/취업/ 주소를 가리키고, 이동 전에는 404)
> - [ ] 게시 후 프로필 표의 '이력서 보기' 링크가 열리는지 확인 (일반 https 링크라 빌드 검사가 없음)
> - [ ] 게시 후 블로그에서 GIF가 움직이는지(애니메이션 WebP) 확인
> - [ ] 전화번호 공개 범위 확인

%% 수치·표현을 고치거나 push하기 전에 [[08_Base/이력서·포트폴리오 작성 가드레일]]을 먼저 확인하세요. %%
<!-- PORTFOLIO_EDITOR_END -->
