const fs = require('fs');

async function checkRoute(apiKey, from, to) {
  const query = new URLSearchParams({
    flat: from.lat.toString(),
    flon: from.lng.toString(),
    tlat: to.lat.toString(),
    tlon: to.lng.toString(),
    mode: "c",
    type: "17",
    locale: "en",
    key: apiKey,
  });

  const url = `https://api.longdo.com/RouteService/geojson/route?${query}`;
  const response = await fetch(url);
  if (!response.ok) {
     return `ERROR ${response.status} ${response.statusText}`;
  }
  const payload = await response.json();
  const features = payload.features || [];
  return `OK, Features: ${features.length}`;
}

async function run() {
  const apiKey = "2c49b107893067280dd4f26571f69c91";
  
  // Test Route 511: Pak Nam to Samrong
  const p1 = { lat: 13.6022, lng: 100.5972 }; // Pak Nam
  const p2 = { lat: 13.6454, lng: 100.5956 }; // Samrong
  
  console.log("Pak Nam to Samrong:", await checkRoute(apiKey, p1, p2));
  
  // Democracy monument to Pinklao
  const p3 = { lat: 13.7568, lng: 100.5018 };
  const p4 = { lat: 13.7774, lng: 100.4771 };
  
  console.log("Democracy to Pinklao:", await checkRoute(apiKey, p3, p4));
}
run();
