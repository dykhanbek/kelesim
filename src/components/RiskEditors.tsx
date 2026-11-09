// Editors for the KYB ownership chain and the goods route — used in the deal wizard and on the
// "Readiness" tab of a saved deal.
import { Plus, Trash2 } from "lucide-react";
import { COUNTRIES } from "../../shared/countries";
import type { DealRoute, RelatedParty } from "../../shared/types";
import { useT, type TKey } from "../i18n";
import { Field } from "./ui";

export const EMPTY_ROUTE: DealRoute = { origin: "CN", transit: [], end_user_country: "KZ", end_user_name: "", reexport: false };

/** Owners → beneficiary chain + director. */
export function RelatedEditor({ value, onChange }: { value: RelatedParty[]; onChange: (v: RelatedParty[]) => void }) {
  const { t, lang } = useT();
  const set = (i: number, p: Partial<RelatedParty>) => onChange(value.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const add = (p: RelatedParty) => onChange([...value, p]);
  return (
    <div className="related-editor">
      {value.length === 0 && <p className="small muted mb-16">{t("kyb.empty")}</p>}
      {value.map((p, i) => (
        <div className="related-row" key={i}>
          <select className="select r-role" value={p.role} aria-label={t("kyb.role")} onChange={(e) => set(i, { role: e.target.value as RelatedParty["role"], kind: e.target.value === "beneficiary" || e.target.value === "director" ? "person" : p.kind })}>
            {(["parent", "owner", "beneficiary", "director"] as const).map((r) => <option key={r} value={r}>{t(`kyb.role.${r}` as TKey)}</option>)}
          </select>
          <select className="select r-kind" value={p.kind} aria-label={t("kyb.kind")} onChange={(e) => set(i, { kind: e.target.value as RelatedParty["kind"] })}>
            <option value="company">{t("kyb.company")}</option>
            <option value="person">{t("kyb.person")}</option>
          </select>
          <input className="input r-name" value={p.name} placeholder={p.kind === "person" ? "Huang Lixin" : "Pearl Delta Holdings Limited"} aria-label={t("kyb.name")} onChange={(e) => set(i, { name: e.target.value })} />
          <select className="select r-country" value={p.country} aria-label={t("wiz.country")} onChange={(e) => set(i, { country: e.target.value })}>
            <option value="">—</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}
          </select>
          <input className="input r-share" inputMode="decimal" value={p.share ?? ""} placeholder="%" aria-label={t("kyb.share")} onChange={(e) => set(i, { share: e.target.value ? Number(e.target.value.replace(",", ".")) : undefined })} disabled={p.role === "director"} />
          <button type="button" className="btn btn-ghost r-del" onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label={t("common.delete")}><Trash2 size={16} /></button>
        </div>
      ))}
      <div className="row mt-8">
        <button type="button" className="btn btn-soft btn-sm" onClick={() => add({ role: "parent", kind: "company", name: "", country: "" })}><Plus size={14} />{t("kyb.addParent")}</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => add({ role: "beneficiary", kind: "person", name: "", country: "" })}><Plus size={14} />{t("kyb.addUbo")}</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => add({ role: "director", kind: "person", name: "", country: "" })}><Plus size={14} />{t("kyb.addDirector")}</button>
      </div>
    </div>
  );
}

/** Origin, transit, end user, re-export. */
export function RouteEditor({ value, onChange }: { value: DealRoute; onChange: (v: DealRoute) => void }) {
  const { t, lang } = useT();
  const set = (p: Partial<DealRoute>) => onChange({ ...value, ...p });
  const toggleTransit = (code: string) => set({ transit: value.transit.includes(code) ? value.transit.filter((c) => c !== code) : [...value.transit, code] });
  return (
    <div>
      <div className="grid-2">
        <Field label={t("route.origin")}>
          <select className="select" value={value.origin} onChange={(e) => set({ origin: e.target.value })}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}
          </select>
        </Field>
        <Field label={t("route.endCountry")} help="hint.enduse">
          <select className="select" value={value.end_user_country} onChange={(e) => set({ end_user_country: e.target.value })}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}
          </select>
        </Field>
      </div>
      <Field label={<>{t("route.transit")} <span className="small muted">({t("common.optional")})</span></>}>
        <div className="chip-select">
          {COUNTRIES.filter((c) => c.code !== value.origin && c.code !== "KZ").map((c) => (
            <button type="button" key={c.code} className={value.transit.includes(c.code) ? "on" : ""} aria-pressed={value.transit.includes(c.code)} onClick={() => toggleTransit(c.code)}>{c[lang]}</button>
          ))}
        </div>
      </Field>
      <Field label={<>{t("route.endName")} <span className="small muted">({t("common.optional")})</span></>} hint={t("route.endNameHint")}>
        <input className="input" value={value.end_user_name} onChange={(e) => set({ end_user_name: e.target.value })} />
      </Field>
      <label className="check mb-16">
        <input type="checkbox" checked={value.reexport} onChange={(e) => set({ reexport: e.target.checked })} />
        <span>{t("route.reexport")}</span>
      </label>
    </div>
  );
}
