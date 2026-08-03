const DEFAULT_DNS_SERVERS = Object.freeze(["1.1.1.1", "1.0.0.1"]);

function configureRuntimeDns(dnsModule = require("node:dns"), servers = DEFAULT_DNS_SERVERS) {
  if (typeof dnsModule?.setServers !== "function") throw new Error("DNS resolver configuration is unavailable.");
  const resolvedServers = Array.isArray(servers) && servers.length ? [...servers] : [...DEFAULT_DNS_SERVERS];
  dnsModule.setServers(resolvedServers);
  return resolvedServers;
}

module.exports = { DEFAULT_DNS_SERVERS, configureRuntimeDns };
