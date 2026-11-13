import { Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { reviewContract, type ReviewResult } from "../../shared/contract-review";
import { useAuth } from "../auth";
import { ContractInput, type ContractSource } from "../components/ContractInput";
import { FindingCard, ReviewSummary } from "../components/ReviewView";
import { useS } from "../i18n.services";
import { PENDING_KEY } from "./Contracts";
import { Footer, PublicHeader } from "./Public";

/** Free check without an account: runs in the browser, shows the top findings, the rest after sign-up. */
export function PublicCheck() {
  const s = useS();
  const { me } = useAuth();
  const [r, setR] = useState<ReviewResult | null>(null);
  const SHOWN = 3;

  const run = (src: ContractSource) => {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(src)); } catch { /* storage unavailable: the user re-uploads after sign-up */ }
    setR(reviewContract(src.text));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const issues = r?.findings.filter((f) => f.sev !== "ok") ?? [];
  const next = me && !me.is_demo ? "/app/contracts" : "/register?next=/app/contracts";

  return (
    <>
      <PublicHeader />
      <div className="container public-check">
        <h1>{s("pub.h1")}</h1>
        <p className="lead-text">{s("pub.lead")}</p>
        {r ? (
          <>
            <ReviewSummary r={r} />
            <div className="findings">{issues.slice(0, SHOWN).map((f) => <FindingCard key={f.id} f={f} />)}</div>
            <div className="card card-indigo mt-24 teaser-cta" style={{ boxShadow: "none" }}>
              <Lock size={22} />
              <div>
                <p><b>{s("pub.more", { n: Math.max(0, issues.length - SHOWN) })}</b></p>
                <div className="row mt-16">
                  <Link className="btn btn-primary" to={next}>{s("pub.register")}</Link>
                  <button className="btn btn-ghost" onClick={() => setR(null)}>{s("rr.again")}</button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="card">
            <ContractInput onSubmit={run} />
            <p className="small muted mt-16">{s("pub.private")}</p>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
