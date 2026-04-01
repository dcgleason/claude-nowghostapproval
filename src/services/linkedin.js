const https = require('https');

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    client_id: process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  });

  return new Promise((resolve, reject) => {
    const data = params.toString();
    const req = https.request(
      {
        hostname: 'www.linkedin.com',
        path: '/oauth/v2/accessToken',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getPersonUrn(accessToken) {
  const result = await httpsGet(
    'api.linkedin.com',
    '/v2/userinfo',
    { Authorization: `Bearer ${accessToken}` }
  );
  // OpenID userinfo returns sub as the person ID
  if (result.body.sub) {
    return `urn:li:person:${result.body.sub}`;
  }
  throw new Error('Could not retrieve LinkedIn person URN');
}

async function createPost(accessToken, personUrn, content) {
  const result = await httpsPost(
    'api.linkedin.com',
    '/v2/ugcPosts',
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }
  );
  return result;
}

// ── App-level client credentials token (for Ad Library API) ──────────────────
let _appTokenCache = null; // { token, expiresAt }

async function getClientCredentialsToken() {
  if (_appTokenCache && _appTokenCache.expiresAt > Date.now() + 60_000) {
    return _appTokenCache.token;
  }
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  });
  return new Promise((resolve, reject) => {
    const data = params.toString();
    const req = https.request(
      {
        hostname: 'www.linkedin.com',
        path: '/oauth/v2/accessToken',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          const body = JSON.parse(raw || '{}');
          if (res.statusCode === 200 && body.access_token) {
            _appTokenCache = {
              token: body.access_token,
              expiresAt: Date.now() + (body.expires_in || 1800) * 1000,
            };
            resolve(body.access_token);
          } else {
            reject(new Error(`Client credentials failed: ${res.statusCode} ${JSON.stringify(body)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Ad Library search ─────────────────────────────────────────────────────────
async function searchAdLibrary({ keywords, count = 10, start = 0, countryCode = 'US' }) {
  const token = await getClientCredentialsToken();
  const params = new URLSearchParams({
    q: 'search',
    'search.query.keywords': keywords,
    'search.countryCode': countryCode,
    count: String(count),
    start: String(start),
  });
  const result = await httpsGet(
    'api.linkedin.com',
    `/v2/adLibrarySearch?${params}`,
    {
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202501',
    }
  );
  return result;
}

async function getPostEngagement(accessToken, postUrn) {
  const encodedUrn = encodeURIComponent(postUrn);
  const result = await httpsGet(
    'api.linkedin.com',
    `/v2/socialActions/${encodedUrn}`,
    {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    }
  );
  if (result.status !== 200) {
    return { error: result.status === 403 ? 'insufficient_scope' : `api_error_${result.status}` };
  }
  const b = result.body;
  return {
    reactions: b.likesSummary?.totalLikes ?? 0,
    comments: b.commentsSummary?.totalFirstLevelComments ?? 0,
    reposts: b.repostsSummary?.repostsCount ?? 0,
  };
}

module.exports = { exchangeCodeForToken, getPersonUrn, createPost, getPostEngagement, searchAdLibrary };
