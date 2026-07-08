import { WhatsAppService } from "./whatsapp.service";

describe("WhatsAppService", () => {
  const ORIGINAL_ENV = { ...process.env };
  let service: WhatsAppService;

  beforeEach(() => {
    service = new WhatsAppService();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  it("mock provider (default): resolves and does not call fetch", async () => {
    delete process.env.WHATSAPP_PROVIDER;
    const fetchSpy = jest.spyOn(global, "fetch");

    await expect(service.send("2348012345678", "hi")).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("meta provider: calls fetch once with exact URL, Bearer auth, and template payload", async () => {
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID";
    process.env.WHATSAPP_ACCESS_TOKEN = "Tok";
    process.env.WHATSAPP_TEMPLATE_NAME = "fees";
    process.env.WHATSAPP_TEMPLATE_LANG = "en";

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);

    await service.send("+2348012345678", "Hello");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/PNID/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer Tok");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "2348012345678",
      type: "template",
      template: {
        name: "fees",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Hello" }] }],
      },
    });
  });

  it("meta provider: throws when res.ok is false", async () => {
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID";
    process.env.WHATSAPP_ACCESS_TOKEN = "Tok";
    process.env.WHATSAPP_TEMPLATE_NAME = "fees";

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad",
    } as Response);

    await expect(service.send("2348012345678", "Hello")).rejects.toThrow(
      "WhatsApp send failed: 400 bad",
    );
  });
});
