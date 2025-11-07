exports.handler = async (event) => {
  const target = (event.queryStringParameters && event.queryStringParameters.url) || '';
  if (!target) return { statusCode: 400, body: JSON.stringify({ error: 'url required' }) };

  try {
    const res = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 (PriceBot)' }});
    const html = await res.text();

    // Try to find prices like $12.34
    const matches = [...html.matchAll(/\$ ?([0-9]{1,5}(?:\.[0-9]{2})?)/g)]
      .map(m => parseFloat(m[1]))
      .filter(v => v >= 1 && v <= 50000);
    const prices = [...new Set(matches)].sort((a,b)=>a-b);

    return { statusCode: 200, body: JSON.stringify({ price: prices[0] ?? null }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'fetch-failed' }) };
  }
};
