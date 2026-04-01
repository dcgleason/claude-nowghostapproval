const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { searchAdLibrary } = require('../services/linkedin');

const router = express.Router();
router.use(requireAuth);

// GET /api/adlibrary/search?q=ServiceNow&count=10&start=0&country=US
router.get('/search', async (req, res) => {
  const keywords = (req.query.q || '').trim();
  if (!keywords) return res.status(400).json({ error: 'q (keywords) is required' });

  const count = Math.min(parseInt(req.query.count) || 10, 20);
  const start = parseInt(req.query.start) || 0;
  const countryCode = (req.query.country || 'US').toUpperCase();

  try {
    const result = await searchAdLibrary({ keywords, count, start, countryCode });

    if (result.status !== 200) {
      console.error('Ad Library API error:', result.status, JSON.stringify(result.body));
      return res.status(result.status === 403 ? 403 : 502).json({
        error: result.status === 403
          ? 'Ad Library API access not enabled — add the "Ad Library API" product in your LinkedIn developer portal.'
          : `LinkedIn API returned ${result.status}`,
        raw: result.body,
      });
    }

    const elements = result.body.elements || [];
    const paging = result.body.paging || { start, count, total: elements.length };

    const ads = elements.map((el) => {
      // Extract ad text — LinkedIn's response shape varies; try common paths
      const contentWrapper = el.content || {};
      const contentKey = Object.keys(contentWrapper)[0] || '';
      const contentObj = contentWrapper[contentKey] || {};

      const text =
        contentObj.introduction ||
        contentObj.text ||
        contentObj.commentary ||
        contentObj.shareCommentary?.text ||
        contentObj.description ||
        el.text ||
        null;

      const title = contentObj.title || contentObj.headline || null;
      const callToAction = contentObj.callToAction?.label || null;
      const destinationUrl = contentObj.callToAction?.url || contentObj.destinationUrl || null;

      const advertiser = el.advertiser || {};
      const advertiserName = advertiser.name || advertiser.followingInfo?.entityUrn || 'Unknown';
      const advertiserUrl = advertiser.url || null;

      const dateRange = el.activeDateRange || {};
      const startDate = dateRange.start
        ? `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}`
        : null;
      const endDate = dateRange.end
        ? `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}`
        : 'Active';

      return {
        id: el.id || el.contentId || null,
        adType: el.adType || 'SPONSORED_CONTENT',
        text,
        title,
        callToAction,
        destinationUrl,
        advertiserName,
        advertiserUrl,
        startDate,
        endDate,
        _raw: process.env.NODE_ENV !== 'production' ? el : undefined,
      };
    });

    res.json({ ads, paging });
  } catch (err) {
    console.error('Ad Library search error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

module.exports = router;
