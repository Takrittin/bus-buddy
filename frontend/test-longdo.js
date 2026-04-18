const apiKey = "2c49b107893067280dd4f26571f69c91";
async function test() {
  const query = new URLSearchParams({
    flat: "13.8023",
    flon: "100.5537",
    tlat: "13.7937",
    tlon: "100.5497",
    mode: "c",
    type: "17",
    locale: "en",
    key: apiKey,
  });
  const res = await fetch(`https://api.longdo.com/RouteService/geojson/route?${query}`);
  const data = await res.json();
  console.log(JSON.stringify(data).slice(0, 500));
}
test();
