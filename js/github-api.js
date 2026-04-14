// github-api.js - GitHub API v3 クライアント

import { getPAT, getConfig } from './storage.js';

const BASE = 'https://api.github.com';

function headers() {
  return {
    Authorization: `token ${getPAT()}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function repoBase() {
  const { owner, repo } = getConfig();
  return `${BASE}/repos/${owner}/${repo}`;
}

// ファイル取得。{ content: object, sha: string } を返す
export async function getFile(path) {
  const res = await fetch(`${repoBase()}/contents/${path}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // content は Base64 (改行付き) でエンコードされている
  const decoded = decodeBase64(data.content);
  return { content: JSON.parse(decoded), sha: data.sha };
}

// ファイル保存。sha がなければ新規作成、あれば更新
export async function putFile(path, contentObj, sha, commitMessage) {
  const body = {
    message: commitMessage || `Update ${path}`,
    content: encodeBase64(JSON.stringify(contentObj, null, 2)),
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${repoBase()}/contents/${path}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return { sha: data.content.sha };
}

// ファイル削除
export async function deleteFile(path, sha, commitMessage) {
  const body = {
    message: commitMessage || `Delete ${path}`,
    sha,
  };
  const res = await fetch(`${repoBase()}/contents/${path}`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
}

// リポジトリの存在確認
export async function checkRepo() {
  const res = await fetch(`${repoBase()}`, { headers: headers() });
  return res.ok;
}

// Base64 エンコード（Unicode 対応）
function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// Base64 デコード（Unicode 対応）
function decodeBase64(str) {
  // GitHub API は改行を含む Base64 を返す
  const clean = str.replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
