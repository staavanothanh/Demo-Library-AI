const { DEFAULT_DNS_SERVERS, configureRuntimeDns } = require("../services/runtimeDns");

describe("runtime DNS configuration", () => {
  it("preserves the existing resolver servers", () => {
    const dnsModule = { setServers: vi.fn() };

    expect(configureRuntimeDns(dnsModule)).toEqual([...DEFAULT_DNS_SERVERS]);
    expect(dnsModule.setServers).toHaveBeenCalledWith([...DEFAULT_DNS_SERVERS]);
  });

  it("accepts an explicit test resolver list without exposing configuration", () => {
    const dnsModule = { setServers: vi.fn() };

    expect(configureRuntimeDns(dnsModule, ["192.0.2.1"])).toEqual(["192.0.2.1"]);
    expect(dnsModule.setServers).toHaveBeenCalledWith(["192.0.2.1"]);
  });
});
