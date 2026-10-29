// Demo account seed: reproduces the dashboard from the mockups (3 active deals,
// a deadline due in 7 days, one overdue deadline, one deal that needs a UCN).
import { checkDeal, dealTotal, screenCounterparty } from "../../shared/compliance";
import { addDays, todayKz } from "../../shared/dates";
import { DEMO_COMPANY, sampleDeal } from "../../shared/sample";
import type { DealInput } from "../../shared/types";
import { addEvent, upsertCounterparty } from "./deals";
import { nowIso, uid } from "./http";

export async function seedDemo(db: D1Database, userId: string) {
  const today = todayKz();
  const c = DEMO_COMPANY;
  await db
    .prepare(
      `INSERT OR REPLACE INTO companies (user_id, bin, legal_form, name_ru, name_en, city, address, signatory, signatory_basis, bank_name, bik, iban)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(userId, c.bin, c.legal_form, c.name_ru, c.name_en, c.city, c.address, c.signatory, c.signatory_basis, c.bank_name, c.bik, c.iban)
    .run();

  // 1. Guangzhou Textile — 18 400 USD, prepaid, goods shipped, repatriation in 7 days.
  const d1 = sampleDeal(addDays(today, -40));
  d1.terms.delivery_date = addDays(today, -5);
  d1.terms.performance_date = addDays(today, 7);

  // 2. Istanbul Home Textile — 9 600 USD, post-payment, delivery overdue by 2 days.
  const d2: DealInput = {
    ...sampleDeal(addDays(today, -30)),
    lang_pair: "ru-en",
    counterparty: {
      name: "Istanbul Home Textile Ltd. Sti.",
      name_local: "İstanbul Ev Tekstili Ltd. Şti.",
      country: "TR",
      address: "Merter Mah., Keresteciler Sitesi 12, Güngören, Istanbul, Türkiye",
      bank_details: "Garanti BBVA · SWIFT TGBATRIS · IBAN TR33 0006 2000 0001 2345 6789 01",
    },
    goods: [
      { name: "Комплект постельного белья", name_alt: "Bed linen set", hs_code: "6302 21", qty: 400, unit: "set", price: 24, net_kg: 520, gross_kg: 560, packages: 40 },
    ],
    batch_note: "",
  };
  d2.terms = { ...d2.terms, incoterm: "DAP", incoterm_place: "Almaty", payment: "postpay", postpay_days: 30, delivery_date: addDays(today, -2), performance_date: addDays(today, 40) };

  // 3. Shenzhen Goods — 64 000 USD, needs a UCN before the first payment.
  const d3: DealInput = {
    ...sampleDeal(today),
    counterparty: {
      name: "Shenzhen Goods Ltd.",
      name_local: "深圳好货有限公司",
      country: "CN",
      address: "Building 5, Bantian Industrial Park, Longgang District, Shenzhen, China",
      bank_details: "China Merchants Bank, Shenzhen · SWIFT CMBCCNBS · A/C 7559 0000 1111",
    },
    goods: [
      { name: "Детская обувь (кроссовки)", name_alt: "儿童运动鞋", hs_code: "6404 11", qty: 4000, unit: "pair", price: 16, net_kg: 2400, gross_kg: 2700, packages: 200 },
    ],
    batch_note: "Весенняя коллекция",
  };

  const deals = [
    { data: d1, number: "KLS-001", done: ["payment", "delivery", "ucn"] },
    { data: d2, number: "KLS-002", done: [] as string[] },
    { data: d3, number: "KLS-003", done: [] as string[] },
  ];

  for (const { data, number, done } of deals) {
    const screening = screenCounterparty(data.counterparty);
    const cpId = await upsertCounterparty(db, userId, data.counterparty, screening);
    data.counterparty.id = cpId;
    const check = checkDeal(data);
    const id = uid();
    const created = new Date(Date.parse(data.terms.sign_date + "T09:00:00Z")).toISOString();
    await db
      .prepare(
        `INSERT INTO deals (id, user_id, number, counterparty_id, status, risk, data_json, check_json, amount, currency, docs_generated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, userId, number, cpId, check.overall, JSON.stringify(data), JSON.stringify(check), dealTotal(data), data.currency, created, created, nowIso())
      .run();
    for (const dl of check.deadlines) {
      await db
        .prepare("INSERT INTO deadlines (id, deal_id, user_id, kind, due_date, done_at, proof_note) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(uid(), id, userId, dl.kind, dl.due_date, done.includes(dl.kind) ? dl.due_date + "T10:00:00.000Z" : null, done.includes(dl.kind) ? "Выписка банка" : "")
        .run();
    }
    await addEvent(db, id, "created");
    await addEvent(db, id, "checked", check.overall);
    await addEvent(db, id, "docs");
  }
  await db.prepare("INSERT OR REPLACE INTO usage (user_id, month, packages) VALUES (?, ?, 1)").bind(userId, today.slice(0, 7)).run();
}
