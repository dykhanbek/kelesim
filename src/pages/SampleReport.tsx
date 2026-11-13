import { Link } from "react-router-dom";
import { formatTenge, serviceById } from "../../shared/services";
import { useAuth } from "../auth";
import { useS } from "../i18n.services";
import { Footer, PublicHeader } from "./Public";

/** Example of the paid deliverable: a supplier check report. The company is fictional; the report itself is in Russian. */
export function SampleReport() {
  const s = useS();
  const { me } = useAuth();
  const sv = serviceById("supplier_check")!;
  const order = me && !me.is_demo ? "/app/services?service=supplier_check" : `/register?next=${encodeURIComponent("/app/services?service=supplier_check")}`;
  const row = (k: string, v: React.ReactNode, flag?: "ok" | "warn" | "risk") => (
    <tr><td>{k}</td><td>{v}{flag && <span className={`badge sev-badge-${flag}`} style={{ marginLeft: 8 }}>{flag === "ok" ? "в порядке" : flag === "warn" ? "уточнить" : "риск"}</span>}</td></tr>
  );
  return (
    <>
      <PublicHeader />
      <div className="container public-check" lang="ru">
        <div className="alert alert-info">Это образец. Компания и все данные вымышлены: так выглядит отчёт, который вы получаете через два рабочих дня после заказа.</div>
        <div className="report">
          <div className="report-head">
            <div>
              <span className="small muted">Отчёт о проверке поставщика · № K-1042 · 12.11.2026</span>
              <h1>Foshan Brightway Lighting Co., Ltd.</h1>
              <p className="muted">佛山市明途照明有限公司 · Фошань, провинция Гуандун, Китай</p>
            </div>
            <div className="verdict verdict-warn"><b>Нужны уточнения</b><span>Платить можно после двух исправлений</span></div>
          </div>

          <h2>Вывод</h2>
          <p>Компания существует, действует с 2014 года и вправе производить и экспортировать светильники. Под санкциями не находится. Два обстоятельства нужно устранить до оплаты: счёт в договоре открыт на другую компанию в Гонконге, а уставный капитал оплачен только на 10%.</p>

          <h2>1. Регистрационные данные</h2>
          <table className="report-table"><tbody>
            {row("Единый код (USCC)", "91440605MA4W0XXXXX")}
            {row("Статус", "Действующая (存续)", "ok")}
            {row("Дата регистрации", "18.03.2014 — 12 лет на рынке", "ok")}
            {row("Уставный капитал", "5 000 000 юаней объявлено, 500 000 юаней оплачено", "warn")}
            {row("Вид деятельности", "Производство и продажа осветительных приборов; экспорт и импорт товаров", "ok")}
            {row("Адрес", "Совпадает с адресом в договоре; по адресу находится производственное здание", "ok")}
            {row("Сотрудников (соцстрах)", "46 человек — фабрика, а не торговый посредник", "ok")}
          </tbody></table>

          <h2>2. Владельцы и руководитель</h2>
          <table className="report-table"><tbody>
            {row("Чэнь Вэйго (陈伟国)", "70%, директор и законный представитель", "ok")}
            {row("Чэнь Лихуа (陈丽华)", "30%", "ok")}
            {row("Санкционные списки", "OFAC, ЕС, Великобритания, ООН — совпадений нет", "ok")}
            {row("Политически значимые лица", "Совпадений нет", "ok")}
          </tbody></table>

          <h2>3. Суды и нарушения</h2>
          <table className="report-table"><tbody>
            {row("Судебные дела", "2 дела за 5 лет, оба — взыскание долга с покупателей в пользу компании", "ok")}
            {row("Список недобросовестных должников", "Не значится", "ok")}
            {row("Административные штрафы", "1 штраф в 2022 году за нарушение пожарной безопасности, оплачен", "ok")}
            {row("Отметки о нарушениях в реестре", "Нет", "ok")}
          </tbody></table>

          <h2>4. Сверка с вашим договором</h2>
          <table className="report-table"><tbody>
            {row("Название продавца", "Совпадает с реестром", "ok")}
            {row("Подписант", "Чэнь Вэйго — законный представитель, вправе подписывать", "ok")}
            {row("Получатель платежа", <>Brightway Trading (HK) Limited, банк в Гонконге — <b>другая компания</b></>, "risk")}
            {row("Печать", "На проекте договора печати нет", "warn")}
          </tbody></table>

          <h2>Что сделать до оплаты</h2>
          <ol>
            <li>Попросите счёт на имя Foshan Brightway Lighting Co., Ltd. в банке материкового Китая. Если поставщик настаивает на гонконгской компании, включите её в договор третьей стороной и запросите письмо о связи компаний на бланке с печатью.</li>
            <li>Получите договор с круглой красной печатью компании и подписью директора.</li>
            <li>Не платите больше 30% аванса: оплаченный капитал компании невелик, взыскать с неё крупную сумму будет трудно.</li>
          </ol>
          <p className="small muted">Источники: государственная система публичной информации о кредитоспособности предприятий КНР, база судебных решений КНР, списки OFAC, ЕС, Великобритании и ООН. Данные актуальны на дату отчёта и не гарантируют исполнение поставщиком обязательств.</p>
        </div>

        <div className="card card-indigo cta-band mt-24" style={{ boxShadow: "none" }}>
          <div><h3>{sv.title.ru}</h3><p className="muted mt-8">{sv.short.ru}</p></div>
          <Link className="btn btn-primary" to={order}>{s("sv.order")} · {formatTenge(sv.price!)}</Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
