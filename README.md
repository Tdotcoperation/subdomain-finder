# Subdomain Finder

심플하고 빠르게 공개 서브도메인을 찾는 웹앱입니다.

## Features

- apex domain 검색
- crt.name 공개 API 사용
- 검색 결과를 애니메이션 리스트로 표시
- 결과 클릭 시 해당 HTTPS 주소를 새 탭에서 열기
- 반응형 모바일 UI
- 별도 빌드 없이 정적 호스팅 가능

## Run

정적 파일만으로 동작합니다. `index.html`을 열거나 GitHub Pages / Cloudflare Pages / Netlify / Vercel 같은 정적 호스팅에 배포하면 됩니다.

## API

현재 검색은 아래 공개 API를 사용합니다.

```text
https://crt.name/v1/search?apex=example.com&format=json
```

crt.name 무료 API 정책에 따라 요청 제한이 적용될 수 있습니다.

## Files

- `index.html` — 화면 구조
- `style.css` — 디자인 및 애니메이션
- `app.js` — 검색, API 요청, 결과 렌더링

## Notes

검색 결과는 공개 인덱스 기반이므로 결과에 표시된 호스트가 현재 실제로 서비스 중이라는 뜻은 아닙니다.
