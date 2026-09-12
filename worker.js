export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/search') {
      return handleSearch(url);
    }

    if (url.pathname === '/api/status') {
      return handleStatus(url);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleSearch(url) {
  const apex = (url.searchParams.get('apex') || '').trim().toLowerCase();

  if (!isValidHostname(apex)) {
    return json({ error: '올바른 도메인을 입력해주세요.' }, 400);
  }

  const upstream = new URL('https://crt.name/v1/search');
  upstream.searchParams.set('apex', apex);

  try {
    const response = await fetch(upstream.toString(), {
      headers: {
        Accept: 'text/plain',
        'User-Agent': 'subdomain-finder/1.2'
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

    return json({ apex, count: subdomains.length, subdomains }, 200, {
      'Cache-Control': 'public, max-age=300'
    });
  } catch {
    return json({ error: 'crt.name 서버에 연결하지 못했습니다.' }, 502);
  }
}

async function handleStatus(url) {
  const host = (url.searchParams.get('host') || '').trim().toLowerCase();

  if (!isValidHostname(host)) {
    return json({ error: '올바른 호스트가 아닙니다.', status: 'worker_error' }, 400);
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), 7000);

  try {
    const response = await fetch(`https://${host}/`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'subdomain-finder-status/1.0',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8'
      }
    });

    clearTimeout(timeout);

    return json({
      host,
      status: 'online',
      httpStatus: response.status,
      ms: Date.now() - started
    }, 200, {
      'Cache-Control': 'public, max-age=120'
    });
  } catch (error) {
    clearTimeout(timeout);

    const timedOut = controller.signal.aborted;
    return json({
      host,
      status: 'offline',
      reason: timedOut ? 'timeout' : 'connection_failed',
      ms: Date.now() - started
    }, 200, {
      'Cache-Control': 'public, max-age=60'
    });
  }
}

function isValidHostname(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

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
