export interface Country {
  code: string;
  ru: string;
  kk: string;
  en: string;
  zh: string;
}

export const COUNTRIES: Country[] = [
  { code: "CN", ru: "Китай", kk: "Қытай", en: "China", zh: "中国" },
  { code: "TR", ru: "Турция", kk: "Түркия", en: "Türkiye", zh: "土耳其" },
  { code: "HK", ru: "Гонконг", kk: "Гонконг", en: "Hong Kong", zh: "中国香港" },
  { code: "AE", ru: "ОАЭ", kk: "БАӘ", en: "UAE", zh: "阿联酋" },
  { code: "KR", ru: "Южная Корея", kk: "Оңтүстік Корея", en: "South Korea", zh: "韩国" },
  { code: "IN", ru: "Индия", kk: "Үндістан", en: "India", zh: "印度" },
  { code: "UZ", ru: "Узбекистан", kk: "Өзбекстан", en: "Uzbekistan", zh: "乌兹别克斯坦" },
  { code: "DE", ru: "Германия", kk: "Германия", en: "Germany", zh: "德国" },
  { code: "IT", ru: "Италия", kk: "Италия", en: "Italy", zh: "意大利" },
  { code: "US", ru: "США", kk: "АҚШ", en: "USA", zh: "美国" },
  { code: "RU", ru: "Россия", kk: "Ресей", en: "Russia", zh: "俄罗斯" },
  { code: "BY", ru: "Беларусь", kk: "Беларусь", en: "Belarus", zh: "白俄罗斯" },
  { code: "IR", ru: "Иран", kk: "Иран", en: "Iran", zh: "伊朗" },
  { code: "KP", ru: "КНДР", kk: "КХДР", en: "North Korea", zh: "朝鲜" },
  { code: "KG", ru: "Кыргызстан", kk: "Қырғызстан", en: "Kyrgyzstan", zh: "吉尔吉斯斯坦" },
  { code: "AM", ru: "Армения", kk: "Армения", en: "Armenia", zh: "亚美尼亚" },
  { code: "GE", ru: "Грузия", kk: "Грузия", en: "Georgia", zh: "格鲁吉亚" },
  { code: "AZ", ru: "Азербайджан", kk: "Әзірбайжан", en: "Azerbaijan", zh: "阿塞拜疆" },
  { code: "MN", ru: "Монголия", kk: "Моңғолия", en: "Mongolia", zh: "蒙古" },
  { code: "KZ", ru: "Казахстан", kk: "Қазақстан", en: "Kazakhstan", zh: "哈萨克斯坦" },
];

export function countryName(code: string, lang: "ru" | "kk" | "en" | "zh"): string {
  const c = COUNTRIES.find((x) => x.code === code);
  return c ? c[lang] : code;
}
