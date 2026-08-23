export type SupportedLanguage = {
  code: string;
  name: string;
  nativeName: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "ig", name: "Igbo", nativeName: "Asụsụ Igbo" },
  { code: "ha", name: "Hausa", nativeName: "Harshen Hausa" },
  { code: "tw", name: "Twi / Akan", nativeName: "Twi" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "ur", name: "Urdu", nativeName: "اردو" },
  { code: "fa", name: "Persian", nativeName: "فارسی" },
  { code: "he", name: "Hebrew", nativeName: "עברית" },
  { code: "tl", name: "Tagalog / Filipino", nativeName: "Filipino" },
];

/**
 * Complete 140+ language name mapping covering all major global and regional languages.
 */
const LANGUAGE_NAME_MAP: Record<string, string> = {
  af: "Afrikaans",
  ak: "Akan / Twi",
  am: "Amharic",
  ar: "Arabic",
  as: "Assamese",
  ay: "Aymara",
  az: "Azerbaijani",
  be: "Belarusian",
  bg: "Bulgarian",
  bho: "Bhojpuri",
  bm: "Bambara",
  bn: "Bengali",
  bs: "Bosnian",
  ca: "Catalan",
  ceb: "Cebuano",
  ckb: "Kurdish (Sorani)",
  co: "Corsican",
  cs: "Czech",
  cy: "Welsh",
  da: "Danish",
  de: "German",
  doi: "Dogri",
  dv: "Dhivehi",
  ee: "Ewe",
  el: "Greek",
  en: "English",
  eo: "Esperanto",
  es: "Spanish",
  et: "Estonian",
  eu: "Basque",
  fa: "Persian",
  fi: "Finnish",
  fil: "Filipino",
  fr: "French",
  fy: "Frisian",
  ga: "Irish",
  gd: "Scots Gaelic",
  gl: "Galician",
  gn: "Guarani",
  gom: "Konkani",
  gu: "Gujarati",
  ha: "Hausa",
  haw: "Hawaiian",
  he: "Hebrew",
  hi: "Hindi",
  hmn: "Hmong",
  hr: "Croatian",
  ht: "Haitian Creole",
  hu: "Hungarian",
  hy: "Armenian",
  id: "Indonesian",
  ig: "Igbo",
  ilo: "Ilocano",
  is: "Icelandic",
  it: "Italian",
  iw: "Hebrew",
  ja: "Japanese",
  jv: "Javanese",
  jw: "Javanese",
  ka: "Georgian",
  kk: "Kazakh",
  km: "Khmer",
  kn: "Kannada",
  ko: "Korean",
  kri: "Krio",
  ku: "Kurdish",
  ky: "Kyrgyz",
  la: "Latin",
  lb: "Luxembourgish",
  lg: "Luganda",
  ln: "Lingala",
  lo: "Lao",
  lt: "Lithuanian",
  lus: "Mizo",
  lv: "Latvian",
  mai: "Maithili",
  mg: "Malagasy",
  mi: "Maori",
  mk: "Macedonian",
  ml: "Malayalam",
  mn: "Mongolian",
  mr: "Marathi",
  ms: "Malay",
  mt: "Maltese",
  my: "Myanmar (Burmese)",
  ne: "Nepali",
  nl: "Dutch",
  no: "Norwegian",
  nso: "Sepedi",
  ny: "Nyanja (Chichewa)",
  om: "Oromo",
  or: "Odia",
  pa: "Punjabi",
  pl: "Polish",
  ps: "Pashto",
  pt: "Portuguese",
  qu: "Quechua",
  ro: "Romanian",
  ru: "Russian",
  rw: "Kinyarwanda",
  sa: "Sanskrit",
  sd: "Sindhi",
  si: "Sinhala",
  sk: "Slovak",
  sl: "Slovenian",
  sm: "Samoan",
  sn: "Shona",
  so: "Somali",
  sq: "Albanian",
  sr: "Serbian",
  st: "Sesotho",
  su: "Sundanese",
  sv: "Swedish",
  sw: "Swahili",
  ta: "Tamil",
  te: "Telugu",
  tg: "Tajik",
  th: "Thai",
  ti: "Tigrinya",
  tk: "Turkmen",
  tl: "Tagalog",
  tr: "Turkish",
  ts: "Tsonga",
  tt: "Tatar",
  tw: "Twi",
  ug: "Uyghur",
  uk: "Ukrainian",
  ur: "Urdu",
  uz: "Uzbek",
  vi: "Vietnamese",
  xh: "Xhosa",
  yi: "Yiddish",
  yo: "Yoruba",
  zh: "Chinese",
  "zh-cn": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
  zu: "Zulu",
};

export function getLanguageName(code: string): string {
  if (!code || code === "und" || code === "unknown") {
    return "Unrecognized language";
  }
  const normalized = code.toLowerCase().trim();
  const base = normalized.split("-")[0];
  return (
    LANGUAGE_NAME_MAP[normalized] ||
    LANGUAGE_NAME_MAP[base] ||
    (code.length <= 4 ? code.toUpperCase() : code)
  );
}

export function getDefaultTargetLanguage(): string {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem("lap_comment_lang");
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      return saved;
    }
    const browserLang = navigator.language?.toLowerCase() || "en";
    const match = SUPPORTED_LANGUAGES.find(
      (l) => l.code === browserLang || l.code === browserLang.split("-")[0],
    );
    return match ? match.code : "en";
  } catch {
    return "en";
  }
}

export function setSavedTargetLanguage(lang: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("lap_comment_lang", lang);
  } catch {}
}

export function getAutoTranslatePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("lap_auto_translate") === "true";
  } catch {
    return false;
  }
}

export function setAutoTranslatePreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("lap_auto_translate", enabled ? "true" : "false");
  } catch {}
}

export type TranslationResult = {
  translatedText: string;
  detectedSourceLang: string;
  sourceLangName: string;
  isSameLanguage: boolean;
  isUnrecognizedLanguage?: boolean;
};

const translationCache = new Map<string, TranslationResult>();

// ==========================================
// Universal Multi-Language Transliteration Engine
// Supports Romanized / Latinized keyboards for:
// 1. Japanese (Romaji -> Kana)
// 2. Chinese (Pinyin -> Hanzi)
// 3. Korean (Romaja -> Hangul)
// 4. Arabic (Arabizi / Franco-Arabic -> Arabic script)
// 5. Russian (Translit -> Cyrillic)
// 6. Greek (Greeklish -> Greek alphabet)
// 7. Hindi (Hinglish -> Devanagari)
// 8. Hebrew (Romanized -> Hebrew script)
// ==========================================

const ROMAJI_TABLE: Record<string, string> = {
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  sha: "しゃ", shu: "しゅ", sho: "しょ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ", jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  tsu: "つ", chi: "ち", shi: "し",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", su: "す", se: "せ", so: "そ",
  ta: "た", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", nn: "ん", "n'": "ん",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", ji: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "de", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  a: "あ", i: "い", u: "う", e: "え", o: "お",
};

function romajiToJapaneseKana(text: string): string {
  let lower = text.toLowerCase();
  lower = lower.replace(/([ksthmyrwgzdbpjcfv])\1/g, "っ$1");
  lower = lower.replace(/\bo\b/g, "を");
  lower = lower.replace(/\bwa\b/g, "は");

  let out = "";
  let i = 0;
  while (i < lower.length) {
    let matched = false;
    for (const len of [4, 3, 2, 1]) {
      const sub = lower.substring(i, i + len);
      if (ROMAJI_TABLE[sub]) {
        out += ROMAJI_TABLE[sub];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (
        lower[i] === "n" &&
        (i === lower.length - 1 || !/[aeiouy]/.test(lower[i + 1]))
      ) {
        out += "ん";
      } else {
        out += lower[i];
      }
      i++;
    }
  }
  return out;
}

const CYRILLIC_MAP: Record<string, string> = {
  shch: "щ", yo: "ё", zh: "ж", ch: "ч", sh: "ш", yu: "ю", ya: "я",
  kh: "х", ts: "ц", ye: "е", yi: "и", ij: "ый", iy: "ий",
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з",
  i: "и", j: "й", k: "к", l: "л", m: "м", n: "н", o: "о",
  p: "п", r: "р", s: "с", t: "т", u: "у", f: "ф", h: "х",
  c: "ц", y: "ы", "'": "ь", "''": "ъ",
};

function translitToCyrillic(text: string): string {
  let result = text.toLowerCase();
  const sortedKeys = Object.keys(CYRILLIC_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    result = result.replaceAll(key, CYRILLIC_MAP[key]);
  }
  return result;
}

const GREEK_MAP: Record<string, string> = {
  ps: "ψ", ks: "ξ", th: "θ", ch: "χ", ou: "ου", ai: "αι", ei: "ει", oi: "οι",
  av: "αυ", af: "αυ", ev: "ευ", ef: "ευ", mp: "μπ", nt: "ντ", gk: "γκ", tz: "τζ",
  a: "α", b: "β", v: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", i: "ι",
  k: "κ", l: "λ", m: "μ", n: "ν", x: "ξ", o: "ο", p: "π", r: "р", s: "σ",
  t: "τ", u: "υ", y: "υ", f: "φ", w: "ω",
};

function greeklishToGreek(text: string): string {
  let result = text.toLowerCase();
  const sortedKeys = Object.keys(GREEK_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    result = result.replaceAll(key, GREEK_MAP[key]);
  }
  result = result.replace(/σ(?=[^a-zα-ωά-ώ]|$)/g, "ς");
  return result;
}

const ARABIZI_VOCAB: Record<string, string> = {
  mar7aba: "مرحبا", marhaba: "مرحبا", ahlan: "أهلا", keifak: "كيفك", kifak: "كيفك",
  "kaifa haluk": "كيف حالك", "kaif al hal": "كيف الحال", shukran: "شكرا", afwan: "عفوا",
  inshallah: "إن شاء الله", "in sha allah": "إن شاء الله", mashallah: "ما شاء الله",
  habibi: "حبيبي", sadiqi: "صديقي", elyoum: "اليوم", "al-yawm": "اليوم",
  jazeelan: "جزيلا", tamam: "تمام", la: "لا", na3am: "نعم", naam: "نعم",
  "sabah el kheer": "صباح الخير", "masa el kheer": "مساء الخير", wainek: "وينك", shu: "شو",
};

function arabiziToArabic(text: string): string {
  let result = text.toLowerCase();
  for (const [w, ar] of Object.entries(ARABIZI_VOCAB)) {
    result = result.replace(new RegExp(`\\b${w}\\b`, "gi"), ar);
  }
  return result;
}

const KOREAN_VOCAB: Record<string, string> = {
  annyeonghaseyo: "안녕하세요", annyeong: "안녕", kamsahamnida: "감사합니다",
  gomasumnida: "고맙습니다", saranghae: "사랑해", saranghaeyo: "사랑해요",
  daebak: "대박", jinjja: "진짜", chincha: "진짜", mannaso: "만ना서",
  bangawayo: "반가워요", bangawoyo: "반가워요", cheongmal: "정말", jeongmal: "정말",
  otoke: "어떡해", eotteoke: "어떻게", kaja: "가자", gaja: "가자",
  ne: "네", aniyo: "아니요", chuka: "축하", oppa: "오빠", unnie: "언니",
};

function romajaToHangul(text: string): string {
  let result = text.toLowerCase();
  for (const [rom, han] of Object.entries(KOREAN_VOCAB)) {
    result = result.replace(new RegExp(`\\b${rom}\\b`, "gi"), han);
  }
  return result;
}

const PINYIN_VOCAB: Record<string, string> = {
  "ni hao ma": "你好吗", "ni hao": "你好", "wo hen hao": "我很好", "xie xie": "谢谢",
  xiexie: "谢谢", "bu ke qi": "不客气", "dui bu qi": "对不起", "mei guan xi": "没关系",
  "wo ai ni": "我爱你", "zai jian": "再见", zaijian: "再见", "hen hao": "很好",
  "wo hen xi huan zhe ge wen zhang": "我很喜欢这篇文章", "wo xi huan": "我喜欢",
  "zhe ge": "这个", "na ge": "那个", "shen me": "什么", "ni de": "你的", "wo de": "我的",
  "bang zhu": "帮助", "wen zhang": "文章", "feichang hao": "非常好", "tai bang le": "太棒了",
};

function pinyinToHanzi(text: string): string {
  let result = text.toLowerCase();
  for (const [pin, hz] of Object.entries(PINYIN_VOCAB)) {
    result = result.replace(new RegExp(`\\b${pin}\\b`, "gi"), hz);
  }
  return result;
}

const HEBREW_VOCAB: Record<string, string> = {
  ani: "אני", ata: "אתה", at: "את", hu: "הוא", hi: "היא", anachnu: "אנחנו", atem: "אתם",
  nehana: "נהנה", neheneh: "נהנה", nehenit: "נהנית", ohev: "אוהב", ohevet: "אוהבת",
  mize: "מזה", meze: "מזה", meza: "מזה", mizeh: "מזה", mipo: "מפה", mikan: "מכאן",
  harbe: "הרבה", harva: "הרבה", yoter: "יותר", midai: "מדי", medi: "מדי",
  shalom: "שלום", "toda raba": "תודה רבה", toda: "תודה", bevakasha: "בבקשה",
  shlomchem: "שלומכם", shlomcha: "שלומך", shlomech: "שלומך", "ma shlomchem": "מה שלומכם",
  "ma shlomcha": "מה שלומך", "boker tov": "בוקר טוב", "erev tov": "ערב טוב",
  "layla tov": "לילה טוב", chaverim: "חברים", sababa: "סבבה", ken: "כן", lo: "לא",
  tov: "טוב", meod: "מאוד", ze: "זה", yofi: "יופי", metzuyan: "מצוין",
  lama: "למה", eich: "איך", ma: "מה", mi: "מי", matai: "מתי", eifo: "איפה",
};

function romanizedToHebrew(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(HEBREW_VOCAB).sort((a, b) => b.length - a.length);
  for (const rom of sorted) {
    result = result.replace(new RegExp(`\\b${rom}\\b`, "gi"), HEBREW_VOCAB[rom]);
  }
  return result;
}

const HINDI_VOCAB: Record<string, string> = {
  namaste: "नमस्ते", namaskar: "नमस्कार", dosto: "दोस्तों", dost: "दोस्त",
  "aap sab kaise hain": "आप सब कैसे हैं", "aap kaise hain": "आप कैसे हैं",
  "kya haal hai": "क्या हाल है", "kya hal hai": "क्या हाल है",
  "yeh post bahut acchi hai": "यह पोस्ट बहुत अच्छी है", "bahut accha": "बहुत अच्छा",
  "bahut acchi": "बहुत अच्छी", shukriya: "शुक्रिया", dhanyawad: "धन्यवाद",
  "mujhe yeh bahut pasand aaya": "मुझे यह बहुत पसंद आया", "mujhe yeh pasand hai": "मुझे यह पसंद है",
  kripya: "कृपया", alvida: "अलविदा", haan: "हाँ", nahi: "नहीं",
};

function hinglishToDevanagari(text: string): string {
  let result = text.toLowerCase();
  for (const [hing, dev] of Object.entries(HINDI_VOCAB)) {
    result = result.replace(new RegExp(`\\b${hing}\\b`, "gi"), dev);
  }
  return result;
}

const PERSIAN_VOCAB: Record<string, string> = {
  salam: "سلام", chetori: "چطوری", khoobi: "خوبی", khobi: "خوبی", mamnoon: "ممنون",
  kheyli: "خیلی", merci: "مرسی", khodahafez: "خداحافظ", khodafez: "خداحافظ",
  "dastet dard nakone": "دستت درد نکنه", lotfan: "لطفا", bebakhshid: "ببخشید",
  "in kheyli khoobe": "این خیلی خوبه", "man in ra doost daram": "من این را دوست دارم",
  "in post alie": "این پست عالیه", ali: "عالی", "khaste nabashid": "خسته نباشید",
  are: "آره", na: "نه", bale: "بله", chera: "چرا", che: "چه", kojai: "کجایی",
};

function fingilishToPersian(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(PERSIAN_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), PERSIAN_VOCAB[k]);
  }
  return result;
}

const URDU_VOCAB: Record<string, string> = {
  "kya haal hai": "کیا حال ہے", "aap kaise hain": "آپ کیسے ہیں", shukriya: "شکریہ",
  "bohot acha": "بہت اچھا", "bohot khoob": "بہت خوب", "mujhe yeh pasand aaya": "مجھے یہ پسند آیا",
  "allah hafiz": "اللہ حافظ", "khuda hafiz": "خدا حافظ", jazakallah: "جزاک اللہ",
  "kya baat hai": "کیا بات ہے", zabardast: "زبردست", bhai: "بھائی", dost: "دوست",
  theek: "ٹھیک", haan: "ہاں", nahi: "نہیں", bohot: "بہت",
};

function romanUrduToUrdu(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(URDU_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), URDU_VOCAB[k]);
  }
  return result;
}

const BENGALI_VOCAB: Record<string, string> = {
  "kemon acho": "কেমন আছো", "kemon achen": "কেমন আছেন", "ami bhalo achi": "আমি ভালো আছি",
  dhonnobad: "ধন্যবাদ", "anek dhonnobad": "অনেক ধন্যবাদ", "onek shundor": "অনেক সুন্দর",
  "khub bhalo": "খুব ভালো", "ei post ta amar khub pochondo hoyeche": "এই পোস্ট টা আমার খুব পছন্দ হয়েছে",
  amar: "আমার", tomar: "তোমার", bhai: "ভাই", apnake: "আপনাকে",
  bhalo: "ভালো", shundor: "সুন্দর", khub: "খুব", ha: "হ্যাঁ", na: "না",
};

function banglishToBengali(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(BENGALI_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), BENGALI_VOCAB[k]);
  }
  return result;
}

const TAMIL_VOCAB: Record<string, string> = {
  vanakkam: "வணக்கம்", "eppadi irukkeenga": "எப்படி இருக்கீங்க", "eppadi irukka": "எப்படி இருக்க",
  nandri: "நன்றி", "romba nandri": "ரொம்ப நன்றி", "romba nalla irukku": "ரொம்ப நல்லா இருக்கு",
  "super post": "அருமையான பதிவு", arumai: "அருமை", "mikka nandri": "மிக்க நன்றி",
  "enakku romba pidichirukku": "எனக்கு ரொம்ப பிடிச்சிருக்கு", seri: "சரி",
  romba: "ரொம்ப", nalla: "நல்லா", aama: "ஆமா", illa: "இல்ல",
};

function tanglishToTamil(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(TAMIL_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), TAMIL_VOCAB[k]);
  }
  return result;
}

const TELUGU_VOCAB: Record<string, string> = {
  namaskaram: "నమస్కారం", "ela unnaru": "ఎలా ఉన్నారు", bagunnanu: "బాగున్నాను",
  dhanyavadalu: "ధన్యవాదాలు", "chala bagundi": "చాలా బాగుంది", "chala manchi post": "చాలా మంచి పోస్ట్",
  "naaku chala nachindi": "నాకు చాలా నచ్చింది", meeru: "మీరు", manchi: "మంచి",
  avunu: "అవును", kadu: "కాదు", chala: "చాలా", bagundi: "బాగుంది",
};

function tenglishToTelugu(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(TELUGU_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), TELUGU_VOCAB[k]);
  }
  return result;
}

const MALAYALAM_VOCAB: Record<string, string> = {
  namaskaram: "നമസ്കാരം", "enthanu vishesham": "എന്താണ് വിശേഷം", sukhamano: "സുഖമാണോ",
  nanni: "നന്ദി", "valare nanni": "വളരെ നന്ദി", "valare nallath": "വളരെ നല്ലത്",
  adipoli: "അടിപൊളി", "adipoli post": "അടിപൊളി post", "enikku valare ishtapettu": "എനിക്ക് വളരെ ഇഷ്ടപ്പെട്ടു",
  athe: "അതെ", alla: "അല്ല", nalla: "നല്ല", valare: "വളരെ",
};

function manglishToMalayalam(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(MALAYALAM_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), MALAYALAM_VOCAB[k]);
  }
  return result;
}

const THAI_VOCAB: Record<string, string> = {
  "sawatdee krub": "สวัสดีครับ", "sawatdee ka": "สวัสดีค่ะ", sawatdee: "สวัสดี",
  "khob khun krap": "ขอบคุณครับ", "khob khun ka": "ขอบคุณค่ะ", "khob khun": "ขอบคุณ",
  "sabai dee mai": "สบายดีไหม", "sabai dee": "สบายดี", aroy: "อร่อย", mak: "มาก",
  "suay mak": "สวยมาก", "chob mak": "ชอบมาก", "mai pen rai": "ไม่เป็นไร",
  chai: "ใช่", mai: "ไม่", jing: "จริง", na: "นะ",
};

function romanizedThaiToThai(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(THAI_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), THAI_VOCAB[k]);
  }
  return result;
}

const ARMENIAN_VOCAB: Record<string, string> = {
  barev: "բարև", "barev dzez": "բարև ձեզ", "inchpes eq": "ինչպե՞ս եք", "inchpes es": "ինչպե՞ս ես",
  shnorhakalutyun: "շնորհակալություն", "shat lav e": "շատ լավ է", hajoghutyun: "հաջողություն",
  "bari or": "բարի օր", "bari luys": "բարի լույս", "bari ereko": "բարի երեկո",
  ayo: "այո", voch: "ոչ", lav: "լավ", shat: "շատ",
};

function armlishToArmenian(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(ARMENIAN_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), ARMENIAN_VOCAB[k]);
  }
  return result;
}

const GEORGIAN_VOCAB: Record<string, string> = {
  gamarjoba: "გამარჯობა", "rogor khar": "როგორ ხარ", "rogor khart": "როგორ ხართ",
  madloba: "მადლობა", "didi madloba": "დიდი მადლობა", kargad: "კარგად",
  "dzalian kargia": "ძალიან კარგია", nakhvamdis: "ნახვამდის", genatsvale: "გენაცვალე",
  ho: "ჰო", ara: "არა", kargi: "კარგი", dzalian: "ძალიან",
};

function georgianTranslitToGeorgian(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(GEORGIAN_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), GEORGIAN_VOCAB[k]);
  }
  return result;
}

const AMHARIC_VOCAB: Record<string, string> = {
  selam: "ሰላም", "endemen neh": "እንደምን ነህ", "endemen nesh": "እንደምን ነሽ", "endemen nachu": "እንደምን ናችሁ",
  ameseginalew: "አመሰግናለሁ", "betam tiru": "በጣም ጥሩ", "betam konjo": "በጣም ቆንጆ",
  tiru: "ጥሩ", konjo: "ቆንጆ", awo: "አዎ", aydelem: "አይደለም",
};

function romanizedAmharicToGeEz(text: string): string {
  let result = text.toLowerCase();
  const sorted = Object.keys(AMHARIC_VOCAB).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    result = result.replace(new RegExp(`\\b${k}\\b`, "gi"), AMHARIC_VOCAB[k]);
  }
  return result;
}

type TransliterationHandler = {
  name: string;
  langCode: string;
  priorityMatch: (detected: string) => boolean;
  detect: (text: string, detected: string) => boolean;
  convert: (text: string) => string;
};

const TRANSLITERATION_PIPELINE: TransliterationHandler[] = [
  {
    name: "Chinese (Pinyin)",
    langCode: "zh-CN",
    priorityMatch: (d) => d === "zh" || d === "zh-CN" || d === "zh-TW",
    detect: (t, d) =>
      d === "zh" || d === "zh-CN" || d === "zh-TW" ||
      /\b(ni hao|xiexie|xie xie|bu ke qi|dui bu qi|mei guan xi|wo ai ni|zai jian|zaijian|hen hao|wo xi huan|zhe ge|na ge|shen me|ni de|wo de|bang zhu|wen zhang|feichang|tai bang le)\b/i.test(t),
    convert: pinyinToHanzi,
  },
  {
    name: "Korean (Romaja)",
    langCode: "ko",
    priorityMatch: (d) => d === "ko",
    detect: (t, d) =>
      d === "ko" ||
      /\b(annyeonghaseyo|annyeong|kamsahamnida|gomasumnida|saranghae|saranghaeyo|daebak|jinjja|chincha|mannaso|bangawayo|bangawoyo|cheongmal|jeongmal|otoke|eotteoke|kaja|gaja|chuka|oppa|unnie|noona|hyung)\b/i.test(t),
    convert: romajaToHangul,
  },
  {
    name: "Arabic (Arabizi)",
    langCode: "ar",
    priorityMatch: (d) => d === "ar",
    detect: (t, d) =>
      d === "ar" ||
      /[235789]/.test(t) ||
      /\b(mar7aba|marhaba|ahlan|keifak|kifak|kaifa haluk|shukran|afwan|inshallah|mashallah|habibi|sadiqi|elyoum|jazeelan|tamam|la|na3am|naam|sabah|masa|wainek|shu)\b/i.test(t),
    convert: arabiziToArabic,
  },
  {
    name: "Persian (Fingilish)",
    langCode: "fa",
    priorityMatch: (d) => d === "fa",
    detect: (t, d) =>
      d === "fa" ||
      /\b(salam|chetori|khoobi|khobi|mamnoon|kheyli|merci|khodahafez|dastet|lotfan|bebakhshid|doost daram|alie|nabashid|kojai)\b/i.test(t),
    convert: fingilishToPersian,
  },
  {
    name: "Urdu (Roman Urdu)",
    langCode: "ur",
    priorityMatch: (d) => d === "ur",
    detect: (t, d) =>
      d === "ur" ||
      /\b(kya haal|bohot|khoob|shukriya|allah hafiz|khuda hafiz|jazakallah|zabardast|kya baat|bhai)\b/i.test(t),
    convert: romanUrduToUrdu,
  },
  {
    name: "Russian (Translit)",
    langCode: "ru",
    priorityMatch: (d) => d === "ru",
    detect: (t, d) =>
      d === "ru" ||
      /\b(privet|spasibo|kak dela|horosho|dobriy|vecher|utro|poka|vsem|dela|segodnya|statyu|pozhaluysta|otlichno|khorosho)\b/i.test(t),
    convert: translitToCyrillic,
  },
  {
    name: "Greek (Greeklish)",
    langCode: "el",
    priorityMatch: (d) => d === "el",
    detect: (t, d) =>
      d === "el" ||
      /\b(kalimera|kalispera|kalinychta|geia|geia sou|geia sas|ti kaneis|ti kanete|efcharisto|parakalo|se olous|poli|endaxi|entaxei)\b/i.test(t),
    convert: greeklishToGreek,
  },
  {
    name: "Hindi (Hinglish)",
    langCode: "hi",
    priorityMatch: (d) => d === "hi",
    detect: (t, d) =>
      d === "hi" ||
      /\b(namaste|namaskar|dosto|dost|aap|kaise|hain|kya|haal|hal|yeh|post|bahut|acchi|accha|shukriya|dhanyawad|pasand|aaya|kripya|alvida|haan|nahi)\b/i.test(t),
    convert: hinglishToDevanagari,
  },
  {
    name: "Bengali (Banglish)",
    langCode: "bn",
    priorityMatch: (d) => d === "bn",
    detect: (t, d) =>
      d === "bn" ||
      /\b(kemon acho|kemon achen|bhalo achi|dhonnobad|onek shundor|khub bhalo|pochondo|apnake|tomar|amar)\b/i.test(t),
    convert: banglishToBengali,
  },
  {
    name: "Tamil (Tanglish)",
    langCode: "ta",
    priorityMatch: (d) => d === "ta",
    detect: (t, d) =>
      d === "ta" ||
      /\b(vanakkam|eppadi|irukkeenga|irukka|nandri|romba|nalla|arumai|pidichirukku|seri)\b/i.test(t),
    convert: tanglishToTamil,
  },
  {
    name: "Telugu (Tenglish)",
    langCode: "te",
    priorityMatch: (d) => d === "te",
    detect: (t, d) =>
      d === "te" ||
      /\b(namaskaram|ela unnaru|bagunnanu|dhanyavadalu|chala bagundi|nachindi|manchi)\b/i.test(t),
    convert: tenglishToTelugu,
  },
  {
    name: "Malayalam (Manglish)",
    langCode: "ml",
    priorityMatch: (d) => d === "ml",
    detect: (t, d) =>
      d === "ml" ||
      /\b(sukhamano|vishesham|adipoli|ishtapettu|valare nanni|valare nallath|namaskaram)\b/i.test(t),
    convert: manglishToMalayalam,
  },
  {
    name: "Thai (Romanized)",
    langCode: "th",
    priorityMatch: (d) => d === "th",
    detect: (t, d) =>
      d === "th" ||
      /\b(sawatdee|khob khun|sabai dee|mai pen rai|chob mak|suay mak|aroy)\b/i.test(t),
    convert: romanizedThaiToThai,
  },
  {
    name: "Armenian (Armlish)",
    langCode: "hy",
    priorityMatch: (d) => d === "hy",
    detect: (t, d) =>
      d === "hy" ||
      /\b(barev|shnorhakalutyun|inchpes eq|inchpes es|shat lav|hajoghutyun|bari or|bari luys)\b/i.test(t),
    convert: armlishToArmenian,
  },
  {
    name: "Georgian (Translit)",
    langCode: "ka",
    priorityMatch: (d) => d === "ka",
    detect: (t, d) =>
      d === "ka" ||
      /\b(gamarjoba|rogor khar|rogor khart|madloba|didi madloba|dzalian kargia|nakhvamdis|genatsvale)\b/i.test(t),
    convert: georgianTranslitToGeorgian,
  },
  {
    name: "Amharic (Romanized)",
    langCode: "am",
    priorityMatch: (d) => d === "am",
    detect: (t, d) =>
      d === "am" ||
      /\b(selam|endemen|ameseginalew|betam tiru|betam konjo)\b/i.test(t),
    convert: romanizedAmharicToGeEz,
  },
  {
    name: "Hebrew (Romanized)",
    langCode: "iw",
    priorityMatch: (d) => d === "iw" || d === "he" || d === "sn",
    detect: (t, d) =>
      d === "iw" || d === "he" || d === "sn" ||
      /\b(shalom|toda|raba|bevakasha|shlomchem|shlomcha|shlomech|boker tov|erev tov|layla tov|chaverim|sababa|ken|lo|ani|nehana|meza|mize|harva|harbe|yoter|medi|midai|tov|meod|ze)\b/i.test(t),
    convert: romanizedToHebrew,
  },
  {
    name: "Japanese (Romaji)",
    langCode: "ja",
    priorityMatch: (d) => d === "ja",
    detect: (t, d) =>
      d === "ja" ||
      /\b(watashi|anata|konnichiwa|arigatou|sumimasen|sayonara|sugoi|kawaii|honto|tabemono|waratta|nusumi|azarashi|neko|inu|desu|da|ga|wa|ni|de|ka|kara|made|to|mo|no|ja|yo|ne)\b/i.test(t),
    convert: romajiToJapaneseKana,
  },
];

const COMMON_ENGLISH_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he",
  "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or",
  "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if", "about",
  "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know",
  "take", "people", "into", "year", "your", "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use", "two", "how", "our",
  "work", "first", "well", "way", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
  "is", "am", "are", "was", "were", "been", "has", "had", "did", "does", "done", "very", "much", "post", "cool",
  "nice", "awesome", "great", "thank", "thanks", "wow", "ok", "okay", "yes", "yeah", "nope", "please", "help",
  "article", "tutorial", "guide", "love", "really", "video", "works", "working", "problem", "issue", "fixed",
  "why", "where", "when", "who", "which", "whom", "whose", "why", "where"
]);

export function isFastEnglishText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!/^[a-zA-Z0-9\s,.'!?"“”‘’\-–—:;()\[\]{}…/]+$/.test(trimmed)) {
    return false;
  }
  const words = trimmed.toLowerCase().match(/[a-z]+/g) || [];
  if (words.length === 0) return false;
  if (words.length <= 3) {
    return words.every((w) => COMMON_ENGLISH_WORDS.has(w));
  }
  const matchCount = words.filter((w) => COMMON_ENGLISH_WORDS.has(w)).length;
  return matchCount / words.length >= 0.35;
}

/**
 * Translates any comment from any source language (including Romanized writing systems)
 * to the target language.
 */
export async function translateCommentText(
  text: string,
  targetLang = "en",
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      translatedText: text,
      detectedSourceLang: targetLang,
      sourceLangName: getLanguageName(targetLang),
      isSameLanguage: true,
    };
  }

  const cacheKey = `${targetLang}:${trimmed}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // Fast-path: If target language is English and text is clearly English, return immediately
  if (targetLang.toLowerCase().startsWith("en") && isFastEnglishText(trimmed)) {
    const result: TranslationResult = {
      translatedText: trimmed,
      detectedSourceLang: "en",
      sourceLangName: "English",
      isSameLanguage: true,
      isUnrecognizedLanguage: false,
    };
    translationCache.set(cacheKey, result);
    return result;
  }

  let translated = "";
  let detectedLang = "";

  // Helper to fetch Chrome Extension translate endpoint
  async function fetchGoogleTranslate(q: string, sl = "auto", tl = targetLang) {
    try {
      const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(
        sl,
      )}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data)) {
        if (Array.isArray(data[0])) {
          return {
            text: typeof data[0][0] === "string" ? data[0][0] : "",
            lang: typeof data[0][1] === "string" ? data[0][1] : sl,
          };
        } else if (typeof data[0] === "string") {
          return { text: data[0], lang: sl };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // Step 1: Direct translation with auto-detect
  const direct = await fetchGoogleTranslate(trimmed, "auto", targetLang);
  if (direct) {
    translated = direct.text;
    detectedLang = direct.lang;
  }

  // Step 2: If the text is in Latin script or mixed characters and either unchanged or matches a transliteration signature
  const isLatinScript = /^[a-zA-Z\s,.'!?"“”‘’\-–—:;()\[\]{}…0-9/]+$/.test(trimmed);
  const isUnchangedOrRaw =
    !translated ||
    translated.trim().toLowerCase() === trimmed.toLowerCase() ||
    ["ja", "zh", "zh-CN", "zh-TW", "ko", "ar", "ru", "el", "iw", "he", "hi", "sn", "luo", "id"].includes(
      detectedLang,
    );

  if (isLatinScript && isUnchangedOrRaw) {
    const candidates = [...TRANSLITERATION_PIPELINE]
      .filter((h) => h.detect(trimmed, detectedLang))
      .sort((a, b) => {
        const aPrior = a.priorityMatch(detectedLang) ? 1 : 0;
        const bPrior = b.priorityMatch(detectedLang) ? 1 : 0;
        return bPrior - aPrior;
      });

    for (const handler of candidates) {
      const converted = handler.convert(trimmed);
      if (converted && converted.toLowerCase() !== trimmed.toLowerCase()) {
        const transResult = await fetchGoogleTranslate(converted, handler.langCode, targetLang);
        if (
          transResult &&
          transResult.text &&
          transResult.text.trim().toLowerCase() !== trimmed.toLowerCase() &&
          transResult.text.trim() !== converted
        ) {
          const result: TranslationResult = {
            translatedText: transResult.text,
            detectedSourceLang: handler.langCode,
            sourceLangName: handler.name,
            isSameLanguage: targetLang === handler.langCode,
            isUnrecognizedLanguage: false,
          };
          translationCache.set(cacheKey, result);
          return result;
        }
      }
    }
  }

  // Step 3: Fallback to MyMemory translation API if translated text is empty
  if (!translated) {
    try {
      const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        trimmed,
      )}&langpair=autodetect|${encodeURIComponent(targetLang)}`;
      const fallbackRes = await fetch(fallbackUrl);
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        if (fbData?.responseData?.translatedText) {
          translated = fbData.responseData.translatedText;
          if (fbData?.matches?.[0]?.source) {
            detectedLang = fbData.matches[0].source.split("-")[0];
          }
        }
      }
    } catch {}
  }

  // Language & recognition analysis
  const finalTranslated = (translated || trimmed).trim();
  const normalizedDetected = (detectedLang || "und").toLowerCase().split("-")[0];
  const normalizedTarget = targetLang.toLowerCase().split("-")[0];

  const isExactMatch = finalTranslated.toLowerCase() === trimmed.toLowerCase();

  // If the target language is different from source, but the output didn't change at all,
  // it means the engine failed to translate (e.g. gibberish or untranslatable input).
  const isUnrecognized =
    normalizedDetected === "und" ||
    normalizedDetected === "unknown" ||
    (!detectedLang && isExactMatch) ||
    (isExactMatch && normalizedDetected !== normalizedTarget);

  const isSameLanguage =
    !isUnrecognized &&
    (normalizedDetected === normalizedTarget ||
      (isExactMatch && normalizedDetected === normalizedTarget));

  const result: TranslationResult = {
    translatedText: finalTranslated,
    detectedSourceLang: isUnrecognized ? "und" : detectedLang,
    sourceLangName: isUnrecognized ? "Unrecognized language" : getLanguageName(detectedLang),
    isSameLanguage,
    isUnrecognizedLanguage: isUnrecognized,
  };

  translationCache.set(cacheKey, result);
  return result;
}
