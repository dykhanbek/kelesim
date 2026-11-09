import { describe, expect, it } from "vitest";
import { cityFromAddress, parseStatGov, titleCase } from "../worker/lib/registry";
import { checkContact, sixDigitCode } from "../worker/routes/verify";

describe("company lookup — stat.gov.kz register", () => {
  // Shape of https://old.stat.gov.kz/api/juridical/counter/api/?bin=…&lang=ru (fields we use)
  const llp = {
    success: true,
    obj: {
      bin: "140540005313",
      name: 'ТОВАРИЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "СТРОЙ ИМПОРТ АСТАНА"',
      registerDate: "2014-05-20T00:00:00.000+0000",
      okedName: "Оптовая торговля строительными материалами",
      katoAddress: "Г.АСТАНА, РАЙОН ЕСИЛЬ, УЛИЦА КЕНЕСАРЫ, ДОМ 40",
      fio: "НУРЛАНОВ ЕРЖАН БОЛАТОВИЧ",
      ip: false,
    },
  };

  it("maps an LLP: short legal form, quoted name, city, director", () => {
    const r = parseStatGov(llp)!;
    expect(r.company.legal_form).toBe("ТОО");
    expect(r.company.name_ru).toBe("ТОО «СТРОЙ ИМПОРТ АСТАНА»");
    expect(r.company.city).toBe("Астана");
    expect(r.company.signatory).toBe("Директор Нурланов Ержан Болатович");
    expect(r.company.signatory_basis).toBe("Устава");
    expect(r.details?.registered).toBe("2014-05-20");
  });

  it("maps a sole proprietor (ИП)", () => {
    const r = parseStatGov({ success: true, obj: { bin: "950312400129", name: "ИП СЕЙТКАЛИ", ip: true, katoAddress: "АЛМАТЫ, ПР. АБАЯ, 150", fio: "СЕЙТКАЛИ АЙГЕРИМ" } })!;
    expect(r.company.legal_form).toBe("ИП");
    expect(r.company.name_ru).toBe("ИП «СЕЙТКАЛИ»");
    expect(r.company.signatory).toBe("Сейткали Айгерим");
    expect(r.company.signatory_basis).toContain("ИП");
  });

  it("returns null when not found or malformed", () => {
    expect(parseStatGov({ success: false, obj: null })).toBeNull();
    expect(parseStatGov({ success: true, obj: { name: "" } })).toBeNull();
    expect(parseStatGov(null)).toBeNull();
  });

  it("helpers", () => {
    expect(titleCase("ҚАЗАҚСТАН ТЕМІР ЖОЛЫ")).toBe("Қазақстан Темір Жолы");
    expect(cityFromAddress("АЛМАТИНСКАЯ ОБЛАСТЬ, Г.КОНАЕВ, УЛ. АБАЯ")).toBe("Конаев");
  });
});

describe("contact verification", () => {
  it("accepts only the user's own Telegram contact matching the login", () => {
    expect(checkContact({ phone_number: "77011234567", user_id: 42 }, 42, "+77011234567")).toBe("ok");
    expect(checkContact({ phone_number: "+7 701 123 45 67", user_id: 42 }, 42, "+77011234567")).toBe("ok");
    expect(checkContact({ phone_number: "77011234567", user_id: 99 }, 42, "+77011234567")).toBe("not_own"); // forwarded someone's contact
    expect(checkContact({ phone_number: "77019999999", user_id: 42 }, 42, "+77011234567")).toBe("mismatch");
  });

  it("generates 6-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(sixDigitCode()).toMatch(/^\d{6}$/);
  });
});
