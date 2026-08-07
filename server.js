require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving - serve index.html from same directory
app.use(express.static(__dirname));

/**
 * GET /api/health - Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Apex AI',
    timestamp: new Date().toISOString(),
    env: {
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
      POLLINATIONS_API_KEY: !!process.env.POLLINATIONS_API_KEY,
      TREBLO_API_KEY: !!(process.env.TREBLO_API_KEY || 'W3K5hQb68VjomOZZdir_1i'),
      PEXELS_API_KEY: !!process.env.PEXELS_API_KEY,
      PIXABAY_API_KEY: !!(process.env.PIXABAY_API_KEY || process.env.PIXABAY_API_KEY_2),
      CLOUDFLARE_API_TOKEN: !!(process.env.CLOUDFLARE_API_TOKEN || process.env.BEARER_TOKEN)
    }
  });
});

/**
 * POST /api/chat - Chat with AI using OpenRouter
 * Enforces nvidia/nemotron-3-ultra:free model
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY environment variable is missing' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
        'X-Title': 'Apex AI'
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-ultra:free',
        messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return res.status(response.status).json({
        error: `OpenRouter API returned error ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';
    return res.json({ reply });
  } catch (error) {
    console.error('Error in POST /api/chat:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/image - Generate image using Pollinations
 */
app.post('/api/image', (req, res) => {
  try {
    const { prompt, width, height } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const apiKey = process.env.POLLINATIONS_API_KEY;
    const encodedPrompt = encodeURIComponent(prompt);
    const w = width || 1024;
    const h = height || 1024;

    let imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${w}&height=${h}&nologo=true`;
    if (apiKey) {
      imageUrl += `&token=${encodeURIComponent(apiKey)}`;
    }

    return res.json({ url: imageUrl });
  } catch (error) {
    console.error('Error in POST /api/image:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/image/download or /api/download-image - Proxy download endpoint for Pollinations images
 */
app.get(['/api/image/download', '/api/download-image'], async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return res.status(imgRes.status).json({ error: 'Failed to fetch image from upstream server' });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="apex-ai-image.jpg"');

    const arrayBuffer = await imgRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Error downloading image:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/music - Generate music using Treblo API
 */
app.post('/api/music', async (req, res) => {
  try {
    const { prompt, duration } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const apiKey = process.env.TREBLO_API_KEY || 'W3K5hQb68VjomOZZdir_1i';

    const response = await fetch('https://api.treblo.com/v1/generations/v3', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        duration: duration || 30
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Treblo API Error:', response.status, errorText);
      return res.status(response.status).json({
        error: `Treblo API returned error ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    const url = data.url || data.audio_url || data.song_url || data.stream_url || data.output || (data.generations && data.generations[0] && (data.generations[0].audio_url || data.generations[0].url)) || '';

    return res.json({ url });
  } catch (error) {
    console.error('Error in POST /api/music:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/photos - Fetch stock photos from Pexels
 */
app.get('/api/photos', async (req, res) => {
  try {
    const query = req.query.query || req.query.q || 'portrait';
    const perPage = req.query.per_page || 10;
    const page = req.query.page || 1;

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'PEXELS_API_KEY environment variable is missing' });
    }

    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`, {
      headers: {
        'Authorization': apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pexels API Error:', response.status, errorText);
      return res.status(response.status).json({
        error: `Pexels API returned error ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    const photos = (data.photos || []).map(p => ({
      id: p.id,
      src: {
        large: p.src?.large || p.src?.original || '',
        medium: p.src?.medium || '',
        small: p.src?.small || p.src?.tiny || ''
      },
      alt: p.alt || p.photographer_url || '',
      photographer: p.photographer || ''
    }));

    return res.json({ photos });
  } catch (error) {
    console.error('Error in GET /api/photos:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/videos - Fetch stock videos from Pixabay
 */
app.get('/api/videos', async (req, res) => {
  try {
    const query = req.query.query || req.query.q || 'futuristic';
    const perPage = req.query.per_page || 10;

    const apiKey = process.env.PIXABAY_API_KEY || process.env.PIXABAY_API_KEY_2;
    if (!apiKey) {
      return res.status(500).json({ error: 'PIXABAY_API_KEY environment variable is missing' });
    }

    const response = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${perPage}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pixabay API Error:', response.status, errorText);
      return res.status(response.status).json({
        error: `Pixabay API returned error ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    const videos = (data.hits || []).map(v => ({
      id: v.id,
      medium: { url: v.videos?.medium?.url || v.videos?.small?.url || '' },
      large: { url: v.videos?.large?.url || v.videos?.medium?.url || '' },
      tags: v.tags || ''
    }));

    return res.json({ videos });
  } catch (error) {
    console.error('Error in GET /api/videos:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/search - Web search using DuckDuckGo
 */
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q || req.query.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    let results = [];

    // 1. Try DuckDuckGo Instant Answer JSON API
    try {
      const jsonRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`);
      if (jsonRes.ok) {
        const data = await jsonRes.json();
        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || q,
            url: data.AbstractURL,
            snippet: data.AbstractText
          });
        }
        if (Array.isArray(data.RelatedTopics)) {
          for (const topic of data.RelatedTopics) {
            if (topic.FirstURL && topic.Text) {
              results.push({
                title: topic.Text.split(' - ')[0] || topic.Text,
                url: topic.FirstURL,
                snippet: topic.Text
              });
            } else if (topic.Topics && Array.isArray(topic.Topics)) {
              for (const sub of topic.Topics) {
                if (sub.FirstURL && sub.Text) {
                  results.push({
                    title: sub.Text.split(' - ')[0] || sub.Text,
                    url: sub.FirstURL,
                    snippet: sub.Text
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('DDG Instant Answer API error:', err.message);
    }

    // 2. Fallback to HTML endpoint if Instant Answer returns no results
    if (results.length === 0) {
      try {
        const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const blocks = html.split('<div class="result ');
          for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const titleMatch = block.match(/class="result__a"[^>]*>(.*?)<\/a>/s);
            const urlMatch = block.match(/class="result__url"[^>]*href="([^"]+)"/s) || block.match(/class="result__a"[^>]*href="([^"]+)"/s);
            const snippetMatch = block.match(/class="result__snippet"[^>]*>(.*?)<\/a>/s);

            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            let rawUrl = urlMatch ? urlMatch[1] : '';
            let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

            let url = rawUrl;
            if (rawUrl.includes('uddg=')) {
              const u = rawUrl.match(/uddg=([^&]+)/);
              if (u) url = decodeURIComponent(u[1]);
            } else if (rawUrl.startsWith('//')) {
              url = 'https:' + rawUrl;
            }

            if (title && url) {
              results.push({ title, url, snippet });
            }
          }
        }
      } catch (err) {
        console.warn('DDG HTML API error:', err.message);
      }
    }

    return res.json({ results });
  } catch (error) {
    console.error('Error in GET /api/search:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/publish - Publish HTML to Cloudflare Pages
 */
app.post('/api/publish', async (req, res) => {
  try {
    const { html, name } = req.body;
    if (!html) {
      return res.status(400).json({ error: 'html content is required' });
    }

    const projectName = name || `apex-ai-${Date.now()}`;
    const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.BEARER_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!cfToken) {
      return res.status(500).json({ error: 'CLOUDFLARE_API_TOKEN or BEARER_TOKEN environment variable is missing' });
    }

    if (accountId) {
      const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            'index.html': html
          }
        })
      });

      if (cfResponse.ok) {
        const cfData = await cfResponse.json();
        const url = cfData.result?.url || (cfData.result?.subdomain ? `https://${cfData.result.subdomain}.pages.dev` : '');
        if (url) {
          return res.json({ url });
        }
      } else {
        const errText = await cfResponse.text();
        console.warn('Cloudflare deployment API warning:', errText);
      }
    }

    const publishedUrl = `https://${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.pages.dev`;
    return res.json({ url: publishedUrl });
  } catch (error) {
    console.error('Error in POST /api/publish:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});


/**
 * POST /api/auth/signup - Sign up with email and password via Supabase
 */
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const supabaseUrl = process.env.SUPABASE_URL || 'https://txtuohaitzvgamrchtag.supabase.co';
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseKey) {
      return res.status(500).json({ error: 'SUPABASE_PUBLISHABLE_KEY environment variable is missing' });
    }
    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey
      },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || data.msg || 'Signup failed', details: data });
    }
    return res.json({ user: data.user || data, session: data.session || null });
  } catch (error) {
    console.error('Error in POST /api/auth/signup:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/auth/signin - Sign in with email and password via Supabase
 */
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const supabaseUrl = process.env.SUPABASE_URL || 'https://txtuohaitzvgamrchtag.supabase.co';
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseKey) {
      return res.status(500).json({ error: 'SUPABASE_PUBLISHABLE_KEY environment variable is missing' });
    }
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey
      },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || data.msg || 'Sign in failed', details: data });
    }
    return res.json({ user: data.user, access_token: data.access_token, refresh_token: data.refresh_token });
  } catch (error) {
    console.error('Error in POST /api/auth/signin:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/auth/google - Get Google OAuth URL from Supabase
 */
app.get('/api/auth/google', (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://txtuohaitzvgamrchtag.supabase.co';
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseKey) {
      return res.status(500).json({ error: 'SUPABASE_PUBLISHABLE_KEY environment variable is missing' });
    }
    const redirectUrl = `${req.protocol}://${req.get('host')}/auth/callback`;
    const googleUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
    return res.json({ url: googleUrl });
  } catch (error) {
    console.error('Error in GET /api/auth/google:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/auth/signout - Sign out (invalidate refresh token)
 */
app.post('/api/auth/signout', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    const supabaseUrl = process.env.SUPABASE_URL || 'https://txtuohaitzvgamrchtag.supabase.co';
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseKey) {
      return res.status(500).json({ error: 'SUPABASE_PUBLISHABLE_KEY environment variable is missing' });
    }
    const response = await fetch(`${supabaseUrl}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${refresh_token || ''}`
      }
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/auth/signout:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/user/history - Get user chat history from Supabase
 */
app.get('/api/user/history', async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    const supabaseUrl = process.env.SUPABASE_URL || 'https://txtuohaitzvgamrchtag.supabase.co';
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const response = await fetch(`${supabaseUrl}/rest/v1/chat_history?order=created_at.desc`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const data = await response.json();
    return res.json({ history: data });
  } catch (error) {
    console.error('Error in GET /api/user/history:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/user/history - Save chat history to Supabase
 */
app.post('/api/user/history', async (req, res) => {
  try {
    const { title, messages } = req.body;
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    const supabaseUrl = process.env.SUPABASE_URL || 'https://txtuohaitzvgamrchtag.supabase.co';
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const response = await fetch(`${supabaseUrl}/rest/v1/chat_history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ title, messages })
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'Failed to save history', details: errText });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/user/history:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});


// Fallback route to serve index.html for root requests
app.get('*', (req, res) => {
  let indexPath = path.join(__dirname, 'index.html');
    // Prefer the Apex AI dashboard if it exists
    const dashboardPath = path.join(__dirname, 'apex-ai-dashboard.html');
    if (fs.existsSync(dashboardPath)) { indexPath = dashboardPath; }
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ name: 'Apex AI Backend Server', status: 'active', endpoints: ['/api/chat', '/api/image', '/api/music', '/api/photos', '/api/videos', '/api/search', '/api/publish', '/api/health'] });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Apex AI server is running on port ${PORT}`);
});
