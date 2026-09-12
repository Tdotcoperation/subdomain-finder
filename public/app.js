const form = document.getElementById('searchForm');
const input = document.getElementById('domainInput');
const button = document.getElementById('searchButton');
const searchBox = document.getElementById('searchBox');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const resultCount = document.getElementById('resultCount');
const resultsTitle = document.getElementById('resultsTitle');
const statusCard = document.getElementById('statusCard');

let statusRun = 0;
let allResults = [];
let renderedCount = 0;
let loadMoreButton = null;
const cardMap = new Map();
const STATUS_CONCURRENCY = 4;
const PAGE_SIZE = 100;

function normalizeDomain(value) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/\.$/, '');
}

function isLikelyDomain(value) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function showSection() {
  document.body.classList.add('has-results');
  resultsSection.classList.add('visible');
}

function showStatus(message) {
  resultsGrid.innerHTML = '';
  removeLoadMore();
  cardMap.clear();
  resultCount.textContent = '';
  statusCard.textContent = message;
  statusCard.classList.remove('hidden');
  showSection();
}

function clearStatus() {
  statusCard.classList.add('hidden');
  statusCard.textContent = '';
}

function setLoading(loading) {
  button.disabled = loading;
  searchBox.classList.toggle('loading', loading);
  button.querySelector('span').textContent = loading ? 'Searching' : 'Search';
}

function extractNames(payload) {
  const found = new Set();
  const add = value => {
    if (typeof value !== 'string') return;
    const name = value.trim().toLowerCase().replace(/^\*\./, '');
    if (name && !name.includes(' ')) found.add(name);
  };

  if (Array.isArray(payload)) {
    payload.forEach(item => {
      if (typeof item === 'string') add(item);
      else if (item && typeof item === 'object') {
        add(item.subdomain); add(item.name); add(item.hostname); add(item.domain);
      }
    });
  } else if (payload && typeof payload === 'object') {
    [payload.results, payload.subdomains, payload.data, payload.names].forEach(collection => {
      if (!Array.isArray(collection)) return;
      collection.forEach(item => {
        if (typeof item === 'string') add(item);
        else if (item && typeof item === 'object') {
          add(item.subdomain); add(item.name); add(item.hostname); add(item.domain);
        }
      });
    });
  }

  return [...found];
}

function renderResults(domain, names) {
  statusRun++;
  clearStatus();
  resultsGrid.innerHTML = '';
  removeLoadMore();
  cardMap.clear();
  resultsTitle.textContent = domain;

  allResults = names
    .filter(name => name === domain || name.endsWith(`.${domain}`))
    .sort((a, b) => {
      if (a === domain) return -1;
      if (b === domain) return 1;
      return a.localeCompare(b);
    });

  renderedCount = 0;
  resultCount.textContent = `${allResults.length.toLocaleString()} found`;
  showSection();

  if (!allResults.length) {
    showStatus('찾은 서브도메인이 없습니다.');
    return;
  }

  renderNextBatch();
  requestAnimationFrame(() => resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function renderNextBatch() {
  if (renderedCount >= allResults.length) {
    removeLoadMore();
    return;
  }

  const start = renderedCount;
  const end = Math.min(start + PAGE_SIZE, allResults.length);
  const batch = allResults.slice(start, end);
  const fragment = document.createDocumentFragment();

  batch.forEach((name, index) => {
    const card = document.createElement('a');
    card.className = 'result-card';
    card.href = `https://${name}`;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.dataset.host = name;
    card.style.animationDelay = `${Math.min(index * 10, 180)}ms`;
    card.innerHTML = `
      <span class="result-main">
        <span class="status-dot pending" aria-label="확인 대기"></span>
        <span class="domain-name">${escapeHtml(name)}</span>
      </span>
      <span class="result-side">
        <span class="status-text">대기 중</span>
        <svg class="open-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8m-6 0h6v6" /><path d="M16 13v5H6V8h5" /></svg>
      </span>`;
    cardMap.set(name, card);
    fragment.appendChild(card);
  });

  resultsGrid.appendChild(fragment);
  renderedCount = end;
  updateLoadMore();

  const runId = statusRun;
  checkStatuses(batch, runId);
}

function updateLoadMore() {
  removeLoadMore();
  if (renderedCount >= allResults.length) return;

  const remaining = allResults.length - renderedCount;
  loadMoreButton = document.createElement('button');
  loadMoreButton.type = 'button';
  loadMoreButton.className = 'load-more';
  loadMoreButton.innerHTML = `<span>더보기</span><small>${remaining.toLocaleString()}개 남음</small>`;
  loadMoreButton.addEventListener('click', renderNextBatch, { once: true });
  resultsGrid.insertAdjacentElement('afterend', loadMoreButton);
}

function removeLoadMore() {
  if (loadMoreButton) {
    loadMoreButton.remove();
    loadMoreButton = null;
  }
}

async function checkStatuses(hosts, runId) {
  let cursor = 0;

  async function worker() {
    while (cursor < hosts.length && runId === statusRun) {
      const host = hosts[cursor++];
      const card = cardMap.get(host);
      if (!card || !card.isConnected) continue;

      setCardStatus(card, 'pending', '홈페이지 확인 중');

      try {
        const response = await fetch(`/api/status?host=${encodeURIComponent(host)}`, {
          headers: { Accept: 'application/json' }
        });

        let payload = null;
        try { payload = await response.json(); } catch {}
        if (runId !== statusRun) return;

        if (!response.ok || !payload || !payload.status) {
          setCardStatus(card, 'worker-error', 'Workers 오류');
          continue;
        }

        if (payload.status === 'website') {
          const detail = payload.httpStatus ? `홈페이지 · ${payload.httpStatus} · ${payload.ms ?? '-'}ms` : '홈페이지 확인';
          setCardStatus(card, 'online', detail);
        } else if (payload.status === 'not_website') {
          let detail = '홈페이지 없음';
          if (payload.reason === 'not_html') detail = '웹페이지 아님';
          else if (payload.reason === 'invalid_html') detail = 'HTML 페이지 아님';
          else if (String(payload.reason || '').startsWith('http_')) detail = `HTTP ${payload.httpStatus || ''}`.trim();
          setCardStatus(card, 'offline', detail);
        } else if (payload.status === 'offline') {
          setCardStatus(card, 'offline', payload.reason === 'timeout' ? '시간 초과' : '연결 실패');
        } else {
          setCardStatus(card, 'worker-error', 'Workers 오류');
        }
      } catch {
        if (runId !== statusRun) return;
        setCardStatus(card, 'worker-error', 'Workers 오류');
      }

      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }

  await Promise.all(Array.from({ length: Math.min(STATUS_CONCURRENCY, hosts.length) }, worker));
}

function setCardStatus(card, state, label) {
  const dot = card.querySelector('.status-dot');
  const text = card.querySelector('.status-text');
  if (!dot || !text) return;
  dot.className = `status-dot ${state}`;
  dot.setAttribute('aria-label', label);
  text.textContent = label;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

async function search(domain) {
  statusRun++;
  setLoading(true);
  clearStatus();
  removeLoadMore();

  try {
    const response = await fetch(`/api/search?apex=${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/json' }
    });

    let payload = null;
    try { payload = await response.json(); } catch {}

    if (!response.ok) {
      throw new Error(payload?.error || `검색 요청에 실패했습니다. (${response.status})`);
    }

    const names = extractNames(payload);
    renderResults(domain, [...new Set(names)]);
  } catch (error) {
    resultsTitle.textContent = domain;
    showStatus(error instanceof Error ? error.message : '검색 중 오류가 발생했습니다.');
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const domain = normalizeDomain(input.value);
  input.value = domain;

  if (!isLikelyDomain(domain)) {
    showStatus('example.com처럼 최상위 도메인을 입력해주세요.');
    input.focus();
    return;
  }

  search(domain);
});
