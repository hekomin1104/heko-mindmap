// storage.js - localStorage ラッパー（PAT・設定管理）

const KEYS = {
  PAT: 'mindmap_pat',
  OWNER: 'mindmap_owner',
  REPO: 'mindmap_repo',
};

export function savePAT(pat) {
  localStorage.setItem(KEYS.PAT, pat);
}

export function getPAT() {
  return localStorage.getItem(KEYS.PAT) || '';
}

export function saveConfig(owner, repo) {
  localStorage.setItem(KEYS.OWNER, owner);
  localStorage.setItem(KEYS.REPO, repo);
}

export function getConfig() {
  return {
    owner: localStorage.getItem(KEYS.OWNER) || '',
    repo: localStorage.getItem(KEYS.REPO) || '',
  };
}

export function isConfigured() {
  const { owner, repo } = getConfig();
  return !!(owner && repo && getPAT());
}

export function clearConfig() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
