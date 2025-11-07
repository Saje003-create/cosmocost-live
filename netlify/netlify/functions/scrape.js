
// Domain-aware price scraper for: 
// - newdirections.com.au (ePages; search or product pages)
// - escentialsofaustralia.com (Shopify)
// - heirloombodycare.com.au (Shopify)

function firstMatch(re, s){
  const m = re.exec(s);
  return m ? m[1] : null;
}

function pickPriceCandidates(html){
  // Generic: find all $xx.xx and return sorted unique list
  const matches = [...html.matchAll(/\$ ?([0-9]{1,5}(?:\.[0-9]{2})?)/g)].map(m=>parseFloat(m[1]));
  const cleaned = matches.filter(v=>v>=1 && v<=50000);
  const uniq = [...new Set(cleaned)].sort((a,b)=>a-b);
  return uniq;
}

function parseShopify(html){
  // Try meta tags
  let price = firstMatch(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([\d\.]+)["'][^>]*>/i, html)
          || firstMatch(/<meta[^>]+name=["']price["'][^>]+content=["']([\d\.]+)["'][^>]*>/i, html)
          || firstMatch(/itemprop=["']price["'][^>]+content=["']([\d\.]+)["']/i, html);
  if(price) return parseFloat(price);

  // Try ld+json blocks for "offers": {"price": ...}
  const jsonBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  for(const block of jsonBlocks){
    try{
      const obj = JSON.parse(block.trim());
      const arr = Array.isArray(obj) ? obj : [obj];
      for(const entry of arr){
        if(entry && entry.offers){
          const offersArr = Array.isArray(entry.offers) ? entry.offers : [entry.offers];
          for(const off of offersArr){
            if(off && off.price) return parseFloat(off.price);
          }
        }
        if(entry && entry.price) return parseFloat(entry.price);
      }
    }catch{}
  }

  // Fallback: generic dollar scan (pick the smallest plausible)
  const list = pickPriceCandidates(html);
  return list.length ? list[0] : null;
}

function parseNewDirections(html){
  // ePages often has price in elements like: class="price" or itemprop="price" content="xx.xx"
  let price = firstMatch(/itemprop=["']price["'][^>]+content=["']([\d\.]+)["']/i, html)
          || firstMatch(/class=["'][^"']*price[^"']*["'][^>]*>\s*\$?\s*([\d\.]+)/i, html)
          || null;
  if(price) return parseFloat(price);

  // Fallback to generic scan
  const list = pickPriceCandidates(html);
  return list.length ? list[0] : null;
}

export async function handler(event, context) {
  const url = (event.queryStringParameters && event.queryStringParameters.url) || '';
  if(!url) return { statusCode: 400, body: JSON.stringify({error:'url required'}) };

  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (PriceBot)' }});
    const html = await res.text();

    let supplier = '';
    let price = null;

    if(url.includes('newdirections.com.au')){
      supplier = 'New Directions AU';
      price = parseNewDirections(html);
    } else if(url.includes('escentialsofaustralia.com')){
      supplier = 'Escentials of Australia';
      price = parseShopify(html);
    } else if(url.includes('heirloombodycare.com.au')){
      supplier = 'Heirloom Body Care';
      price = parseShopify(html);
    } else {
      // Unknown domain → generic
      price = (pickPriceCandidates(html)[0]) || null;
    }

    return { statusCode: 200, body: JSON.stringify({ price: price ? price.toFixed(2) : null, supplier }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'fetch-failed' }) };
  }
}
