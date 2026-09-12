const form = document.getElementById('searchForm');
const input = document.getElementById('domainInput');
const button = document.getElementById('searchButton');
const searchBox = document.getElementById('searchBox');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const resultCount = document.getElementById('resultCount');
const resultsTitle = document.getElementById('resultsTitle');
const statusCard = document.getElementById('statusCard');

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
  const add = (value) => {
    if (typeof value !== 'string') return;
    const name = value.trim().toLowerCase().replace(/^\*\./, '');
    if (name && !name.includes(' ')) found.add(name);
  };

  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (typeof item === 'string') add(item);
      else if (item && typeof item === 'object') {
        add(item.subdomain); add(item.name); add(item.hostname); add(item.domain);
      }
    }
  } else if (payload && typeof payload === 'object') {
    const collections = [payload.results, payload.subdomains, payload.data, payload.names];
    collections.forEach((collection) => {
      if (!Array.isArray(collection)) return;
      collection.forEach((item) => {
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
  clearStatus();
  resultsGrid.innerHTML = '';
  resultsTitle.textContent = domain;

  const filtered = names
    .filter((name) => name === domain || name.endsWith(`.${domain}`))
    .sort((a, b) => {
      if (a === domain) return -1;
      if (b === domain) return 1;
      return a.localeCompare(b);
    });

  resultCount.textContent = `${filtered.length.toLocaleString()} found`;
  showSection();

  if (!filtered.length) {
    showStatus('찾은 서브도메인이 없습니다.');
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((name, index) => {
    const card = document.createElement('a');
    card.className = 'result-card';
    card.href = `https://${name}`;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.style.animationDelay = `${Math.min(index * 24, 480)}ms`;
    card.innerHTML = `<span class="domain-name">${escapeHtml(name)}</span><svg class="open-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8m-6 0h6v6" /><path d="M16 13v5H6V8h5" /></svg>`;
    fragment.appendChild(card);
  });
  resultsGrid.appendChild(fragment);

  requestAnimationFrame(() => resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

async function search(domain) {
  setLoading(true);
  clearStatus();

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

form.addEventListener('submit', (event) => {
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
