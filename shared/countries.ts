export interface Country {
  code: string;
  ru: string;
  en: string;
  zh: string;
}

export const COUNTRIES: Country[] = [
  { code: "CN", ru: "Китай", en: "China", zh: "中国" },
  { code: "TR", ru: "Турция", en: "Türkiye", zh: "土耳其" },
  { code: "HK", ru: "Гонконг", en: "Hong Kong", zh: "中国香港" },
  { code: "AE", ru: "ОАЭ", en: "UAE", zh: "阿联酋" },
  { code: "KR", ru: "Южная Корея", en: "South Korea", zh: "韩国" },
  { code: "IN", ru: "Индия", en: "India", zh: "印度" },
  { code: "UZ", ru: "Узбекистан", en: "Uzbekistan", zh: "乌兹别克斯坦" },
  { code: "DE", ru: "Германия", en: "Germany", zh: "德国" },
  { code: "IT", ru: "Италия", en: "Italy", zh: "意大利" },
  { code: "US", ru: "США", en: "USA", zh: "美国" },
  { code: "RU", ru: "Россия", en: "Russia", zh: "俄罗斯" },
  { code: "BY", ru: "Беларусь", en: "Belarus", zh: "白俄罗斯" },
  { code: "IR", ru: "Иран", en: "Iran", zh: "伊朗" },
  { code: "KP", ru: "КНДР", en: "North Korea", zh: "朝鲜" },
  { code: "KZ", ru: "Казахстан", en: "Kazakhstan", zh: "哈萨克斯坦" },
];

export function countryName(code: string, lang: "ru" | "en" | "zh"): string {
  const c = COUNTRIES.find((x) => x.code === code);
  return c ? c[lang] : code;
}
