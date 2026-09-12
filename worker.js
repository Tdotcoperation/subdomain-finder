export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/search') {
      const apex = (url.searchParams.get('apex') || '').trim().toLowerCase();

      if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(apex)) {
        return json({ error: '올바른 도메인을 입력해주세요.' }, 400);
      }

      const upstream = new URL('https://crt.name/v1/search');
      upstream.searchParams.set('apex', apex);

      try {
        const response = await fetch(upstream.toString(), {
          headers: {
            'Accept': 'text/plain',
            'User-Agent': 'subdomain-finder/1.1'
          },
          cf: { cacheTtl: 300, cacheEverything: true }
        });

        const text = await response.text();

        if (!response.ok) {
          const message = response.status === 429
            ? 'crt.name API 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'
            : `crt.name 검색 요청에 실패했습니다. (${response.status})`;
          return json({ error: message }, response.status);
        }

        const subdomains = [...new Set(
          text
            .split(/\r?\n/)
            .map(v => v.trim().toLowerCase().replace(/^\*\./, ''))
            .filter(Boolean)
            .filter(name => name === apex || name.endsWith(`.${apex}`))
        )];

        return json({
          apex,
          count: subdomains.length,
          subdomains
        }, 200, {
          'Cache-Control': 'public, max-age=300'
        });
      } catch (error) {
        return json({ error: 'crt.name 서버에 연결하지 못했습니다.' }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}
