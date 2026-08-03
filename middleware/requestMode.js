function readHeader(req, name) {
  if (!req) return undefined;
  if (typeof req.get === "function") return req.get(name);
  const headers = req.headers || {};
  const expected = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === expected);
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? undefined : value;
}

function isHtmxRequest(req) {
  return readHeader(req, "HX-Request") === "true";
}

function varyOnHtmx(res) {
  if (res && typeof res.vary === "function") res.vary("HX-Request");
  return res;
}

module.exports = { isHtmxRequest, varyOnHtmx };
