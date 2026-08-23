// 買い物リストの中核処理。
// ブラウザからもNode（テスト）からも同じものを使うため、DOMには一切触れない。
//
// iOSアプリ版と同じ考え方で作っている。
// 分量の足し算はAIに任せず、ここで確定的に計算する。

// ---------------------------------------------------------------------------
// 文字の下ごしらえ
// ---------------------------------------------------------------------------

/** 全角の英数字・記号（U+FF01〜U+FF5E）だけを半角にする。カタカナには触らない。 */
export function toHalfwidth(text) {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code >= 0xff01 && code <= 0xff5e) {
      result += String.fromCodePoint(code - 0xfee0);
    } else {
      result += char;
    }
  }
  return result;
}

/** 「½」のような分数記号を、半角の分数に開く。前の空白は「1½」を「1 1/2」と読ませるため。 */
const VULGAR_FRACTIONS = {
  "½": " 1/2", "⅓": " 1/3", "⅔": " 2/3", "¼": " 1/4", "¾": " 3/4",
  "⅕": " 1/5", "⅖": " 2/5", "⅗": " 3/5", "⅘": " 4/5",
  "⅙": " 1/6", "⅚": " 5/6",
  "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8",
};

export function normalizeText(text) {
  let result = toHalfwidth(String(text).trim());
  for (const [symbol, replacement] of Object.entries(VULGAR_FRACTIONS)) {
    result = result.split(symbol).join(replacement);
  }
  return result.split("　").join(" ").trim();
}

/**
 * 数字と数字の間にある「と」「〜」だけを扱う。
 * 「1と1/2」は足し算、「2〜3」は範囲。材料名や単位の文字には触らない。
 */
function normalizeConnectors(text) {
  const chars = [...text];
  let result = "";

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const previous = chars[i - 1];
    const next = chars[i + 1];
    const between = isDigit(previous) && isDigit(next);

    if (between && char === "と") result += " ";
    else if (between && "-~〜～–—".includes(char)) result += "~";
    else result += char;
  }
  return result;
}

function isDigit(char) {
  return char !== undefined && char >= "0" && char <= "9";
}

// ---------------------------------------------------------------------------
// 分量
// ---------------------------------------------------------------------------

/** 「大さじ2」のように単位が先に来る書き方。 */
const PREFIX_UNITS = ["大さじ", "小さじ", "カップ"];

/** 数値を持たない曖昧な表記。数値のある分量が他にあれば、こちらは落として合算する。 */
const VAGUE_QUANTITIES = [
  "少々", "少量", "適量", "適宜", "お好みで", "好みで", "ひとつまみ", "ふたつまみ",
];

/** 単位の表記ゆれ。左を右に寄せてから比較する。 */
const UNIT_ALIASES = {
  "コ": "個", "こ": "個", "ヶ": "個", "ケ": "個",
  "片": "かけ", "かけら": "かけ", "カケ": "かけ",
  "グラム": "g", "きろ": "kg", "キロ": "kg", "キログラム": "kg",
  "cc": "ml", "ミリリットル": "ml", "リットル": "l", "ℓ": "l",
  "おおさじ": "大さじ", "こさじ": "小さじ",
};

/** 単位の末尾に付きやすい飾り。「1かけ分」＝「1かけ」。 */
const UNIT_SUFFIXES = ["分", "程度", "くらい", "ぐらい", "ほど", "位", "弱", "強"];

function canonicalUnit(raw) {
  let unit = raw.trim();
  if (!unit) return "";

  // 「2人分」の「分」は飾りではないので、そのまま残す。
  if (unit === "人分" || unit === "人前") return unit;

  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of UNIT_SUFFIXES) {
      if ([...unit].length > 1 && unit.endsWith(suffix)) {
        unit = unit.slice(0, -suffix.length);
        stripped = true;
      }
    }
  }

  if (/^[A-Za-z]+$/.test(unit)) unit = unit.toLowerCase();
  return UNIT_ALIASES[unit] ?? unit;
}

/** 「2」「1/2」「1 1/2」「2.5」「2~3」を数値にする。範囲は多いほうを採る。 */
function parseNumber(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  let total = 0;
  for (const component of normalized.split(" ").filter(Boolean)) {
    if (component.includes("~")) {
      const parts = component.split("~");
      const values = parts.map(parseSimpleNumber);
      if (values.some((v) => v === null)) return null;
      total += Math.max(...values);
    } else {
      const value = parseSimpleNumber(component);
      if (value === null) return null;
      total += value;
    }
  }
  return total;
}

function parseSimpleNumber(text) {
  if (text.includes("/")) {
    const pair = text.split("/");
    if (pair.length !== 2) return null;
    const numerator = Number(pair[0]);
    const denominator = Number(pair[1]);
    if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return null;
    return numerator / denominator;
  }
  if (text === "" || !isFinite(Number(text))) return null;
  return Number(text);
}

/** 「1本(30g)」のように、主となる分量と括弧内の補足に分ける。 */
function splitNote(text) {
  const open = text.indexOf("(");
  if (open === -1) return [text, null];
  const close = text.indexOf(")", open);
  if (close === -1) return [text, null];

  const note = text.slice(open + 1, close).trim();
  const main = (text.slice(0, open) + text.slice(close + 1)).trim();
  return [main, note];
}

/** 「200g」「大さじ2」を数値と単位に分ける。 */
function parseValueUnit(text) {
  let rest = text.trim();
  if (!rest) return null;

  for (const prefix of ["約", "およそ", "合計", "計", "全部で", "各"]) {
    if (rest.startsWith(prefix)) rest = rest.slice(prefix.length).trim();
  }

  for (const unit of PREFIX_UNITS) {
    if (rest.startsWith(unit)) {
      const value = parseNumber(rest.slice(unit.length));
      return value === null ? null : { value, unit };
    }
  }

  // レシピサイトでよくある略記。「大1」＝大さじ1、「小1/4」＝小さじ1/4。
  // 「大2個」のように後ろへ別の単位が続くものは略記ではないので、
  // 残りが数値だけのときに限って読み替える。
  for (const [short, full] of [["大", "大さじ"], ["小", "小さじ"]]) {
    if (rest.startsWith(short)) {
      const tail = rest.slice(short.length);
      const value = tail ? parseNumber(tail) : null;
      if (value !== null) return { value, unit: full };
    }
  }

  // 先頭の数値部分と、それに続く単位に分ける（例: 200g → 200 と g）。
  let numberPart = "";
  let unitPart = "";
  for (const char of rest) {
    if (!unitPart && "0123456789./~ ".includes(char)) numberPart += char;
    else unitPart += char;
  }

  const value = parseNumber(numberPart);
  if (value === null) return null;
  return { value, unit: canonicalUnit(unitPart) };
}

function parseAmount(quantity) {
  const text = normalizeConnectors(normalizeText(quantity));
  const [main, noteText] = splitNote(text);

  const primary = parseValueUnit(main);
  if (!primary) return null;

  return {
    value: primary.value,
    unit: primary.unit,
    note: noteText ? parseValueUnit(noteText) : null,
  };
}

/** 合算結果を読みやすい形に戻す。0.5は「1/2」のように分数で表示する。 */
function formatAmount(value, unit) {
  const whole = Math.trunc(value);
  const fraction = value - whole;

  const table = {
    13: "1/8", 17: "1/6", 20: "1/5", 25: "1/4", 33: "1/3", 38: "3/8", 40: "2/5",
    50: "1/2", 60: "3/5", 63: "5/8", 67: "2/3", 75: "3/4", 80: "4/5", 83: "5/6", 88: "7/8",
  };
  const fractionText = table[Math.round(fraction * 100)] ?? null;

  let numberText;
  if (fractionText) numberText = whole === 0 ? fractionText : `${whole} ${fractionText}`;
  else if (fraction === 0) numberText = String(whole);
  else numberText = value.toFixed(1);

  return PREFIX_UNITS.includes(unit) ? `${unit}${numberText}` : `${numberText}${unit}`;
}

/** 同じ単位の分量をまとめて1つの文字列にする。 */
function combine(amounts, unit) {
  const total = amounts.reduce((sum, a) => sum + a.value, 0);
  let text = formatAmount(total, unit);

  // 「1本(30g)」のような補足も、全部に付いていて単位が同じなら足す。
  const noteUnits = new Set(amounts.map((a) => a.note?.unit).filter((u) => u !== undefined));
  if (amounts.every((a) => a.note) && noteUnits.size === 1) {
    const noteTotal = amounts.reduce((sum, a) => sum + a.note.value, 0);
    text += `(${formatAmount(noteTotal, [...noteUnits][0])})`;
  }

  return text;
}

/**
 * 2つ以上の分量表記を1つにまとめる。単位が揃っていれば足し算する。
 *
 * 合算できなかった分量は「2個 + 4g」のように並記されるが、それを次回また渡されることがある。
 * そのため最初に「+」で分解し、並記された分量も改めて足し算の対象にする。
 */
export function mergeQuantities(quantities) {
  const valid = quantities
    .flatMap((q) => String(q ?? "").split("+"))
    .map((q) => q.trim())
    .filter(Boolean);

  if (valid.length === 0) return "";

  // 1つだけのときも、「大1」→「大さじ1」のように読みやすい形に直してから返す。
  if (valid.length === 1) {
    const amount = parseAmount(valid[0]);
    return amount ? combine([amount], amount.unit) : valid[0];
  }

  const amounts = valid.map(parseAmount);
  if (amounts.every(Boolean)) {
    const order = [];
    const groups = new Map();
    for (const amount of amounts) {
      if (!groups.has(amount.unit)) {
        groups.set(amount.unit, []);
        order.push(amount.unit);
      }
      groups.get(amount.unit).push(amount);
    }

    // 単位が省略されている項目（「1/2」だけ、など）は、
    // 名前のある単位が1つだけなら、その単位のものとして数える。
    const named = order.filter(Boolean);
    if (named.length <= 1) return combine(amounts, named[0] ?? "");

    // 単位が本当に違う場合でも、同じ単位どうしは足しておく（2個 + 4g など）。
    return order.map((unit) => combine(groups.get(unit), unit)).join(" + ");
  }

  // 「少々」のように数えられない表記が混ざっているだけなら、それを外して合算する。
  const numeric = valid.filter((q) => !VAGUE_QUANTITIES.some((v) => q.includes(v)));
  if (numeric.length < valid.length && numeric.length > 0) return mergeQuantities(numeric);

  return [...new Set(valid)].join(" + ");
}

// ---------------------------------------------------------------------------
// カテゴリ
// ---------------------------------------------------------------------------

export const CATEGORIES = ["野菜", "肉・魚", "乳製品・卵", "調味料", "その他"];

// 長い言葉から先に照合する。「鶏がら」を「鶏」より先に見るため。
const CATEGORY_KEYWORDS = [
  ["野菜", [
    "玉ねぎ", "たまねぎ", "玉葱", "長ねぎ", "長ネギ", "青ねぎ", "小ねぎ", "ねぎ", "ネギ",
    "にんじん", "人参", "じゃがいも", "じゃが芋", "馬鈴薯", "さつまいも", "さつま芋",
    "里芋", "さといも", "大根", "だいこん", "かぶ", "キャベツ", "白菜", "はくさい",
    "レタス", "きゅうり", "トマト", "ミニトマト", "ピーマン", "パプリカ", "なす", "ナス",
    "ほうれん草", "ほうれんそう", "小松菜", "こまつな", "ブロッコリー", "カリフラワー",
    "かぼちゃ", "ごぼう", "れんこん", "レンコン", "もやし", "にんにく", "ニンニク",
    "しょうが", "生姜", "しめじ", "しいたけ", "椎茸",
    "えのき", "まいたけ", "エリンギ", "マッシュルーム", "きのこ", "アボカド",
    "オクラ", "ズッキーニ", "セロリ", "春菊", "水菜", "三つ葉", "大葉", "青じそ",
    "みょうが", "かいわれ", "いんげん", "絹さや", "さやえんどう", "スナップえんどう",
    "とうもろこし", "コーン", "枝豆", "そら豆", "アスパラ", "パセリ", "バジル", "パクチー",
    "レモン", "りんご", "バナナ", "みかん", "ゆず", "すだち", "ライム",
  ]],
  ["肉・魚", [
    "鶏もも", "鶏むね", "鶏胸", "鶏ささみ", "ささみ", "手羽先", "手羽元", "鶏肉", "鶏",
    "豚バラ", "豚ロース", "豚こま", "豚肉", "豚", "牛バラ", "牛ロース", "牛こま", "牛肉", "牛",
    "ひき肉", "挽き肉", "挽肉", "ミンチ", "ベーコン", "ハム", "ソーセージ", "ウインナー",
    "鮭", "サケ", "さけ", "鯖", "サバ", "さば", "ぶり", "ブリ", "たら", "タラ", "鱈",
    "いわし", "イワシ", "あじ", "アジ", "さんま", "サンマ", "まぐろ", "マグロ", "かつお",
    "えび", "エビ", "海老", "いか", "イカ", "たこ", "タコ", "ほたて", "ホタテ",
    "あさり", "しじみ", "かき", "カニ", "かに", "ツナ", "しらす", "刺身", "切り身",
    "ちくわ", "かまぼこ", "はんぺん", "さつま揚げ",
  ]],
  ["乳製品・卵", [
    "卵", "たまご", "玉子", "牛乳", "生クリーム", "ホイップ", "チーズ", "バター",
    "ヨーグルト", "練乳", "豆乳",
  ]],
  ["調味料", [
    "塩", "こしょう", "コショウ", "胡椒", "ペッパー", "醤油", "しょう油", "しょうゆ",
    "味噌", "みそ", "砂糖", "みりん", "料理酒", "酒", "酢", "ごま油", "オリーブオイル",
    "サラダ油", "ラー油", "油", "片栗粉", "小麦粉", "薄力粉", "強力粉", "パン粉",
    "だし", "出汁", "白だし", "めんつゆ", "ポン酢", "顆粒", "コンソメ", "鶏がら",
    "ケチャップ", "オイスターソース", "ソース", "マヨネーズ", "からし", "わさび",
    "豆板醤", "コチュジャン", "はちみつ", "蜂蜜", "山椒", "七味", "一味", "カレー粉",
    "ナンプラー", "ベーキングパウダー", "重曹", "ドレッシング", "バジルソース",
  ]],
  ["その他", [
    "豆腐", "油揚げ", "厚揚げ", "納豆", "こんにゃく", "しらたき", "春雨", "パスタ",
    "スパゲッティ", "うどん", "そば", "中華麺", "ご飯", "ごはん", "米", "パン", "餅",
    "のり", "海苔", "ごま", "わかめ", "ひじき", "昆布", "かつお節", "高野豆腐",
    "トマト缶", "缶", "ココナッツミルク", "くるみ", "アーモンド", "ナッツ", "レーズン",
    "水", "氷", "ワイン",
  ]],
];

const KEYWORD_TABLE = CATEGORY_KEYWORDS
  .flatMap(([category, words]) => words.map((word) => [word, category]))
  .sort((a, b) => b[0].length - a[0].length);

/** 材料名から売り場を推測する。当てはまらなければ「その他」。 */
export function categorize(name) {
  const target = normalizeText(name);
  for (const [word, category] of KEYWORD_TABLE) {
    if (target.includes(word)) return category;
  }
  return "その他";
}

export function categoryIndex(category) {
  const index = CATEGORIES.indexOf(category);
  return index === -1 ? CATEGORIES.length : index;
}

// ---------------------------------------------------------------------------
// レシピ本文の切り出し
// ---------------------------------------------------------------------------

const INGREDIENT_HEADINGS = ["材料", "材料・調味料"];
const END_HEADINGS = [
  "作り方", "つくり方", "作りかた", "手順", "調理手順", "下ごしらえ",
  "ポイント", "コツ", "メモ", "このレシピの生い立ち", "レシピの生い立ち",
];
const NOISE_LINES = new Set([
  "menu", "search", "copy", "share", "recipe", "home", "top", "pr", "ad",
  "広告", "スポンサーリンク", "もくじ", "目次", "シェア", "ツイート", "保存",
  "お気に入り", "印刷", "コメント", "レビュー", "検索", "ログイン", "会員登録",
]);

function strippedHeading(line) {
  return line
    .split(" ").join("")
    .split("　").join("")
    .replace(/^[＜＞<>【】「」『』■□●○◆◇★☆・:：]+/, "")
    .replace(/[＜＞<>【】「」『』■□●○◆◇★☆・:：]+$/, "");
}

/** 「RECIPE RECIPE RECIPE」のように同じ語が続く行を1つにまとめる。 */
function collapseRepeats(line) {
  const tokens = line.split(" ").filter(Boolean);
  if (tokens.length <= 1) return line;

  const result = [];
  for (const token of tokens) {
    if (token !== result[result.length - 1]) result.push(token);
  }
  return result.join(" ");
}

function isNoise(line) {
  if (NOISE_LINES.has(line.toLowerCase())) return true;
  return ![...line].some((char) => /[\p{L}\p{N}]/u.test(char));
}

function tidy(raw) {
  const result = [];
  for (const rawLine of String(raw).split(/\r\n|\r|\n/)) {
    const line = collapseRepeats(rawLine.trim());
    if (!line || isNoise(line)) continue;
    if (line === result[result.length - 1]) continue;
    result.push(line);
  }
  return result;
}

function breadcrumbTitle(lines) {
  for (const line of lines.slice(0, 40)) {
    if (!line.includes(">")) continue;
    const parts = line.split(">").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const last = parts[parts.length - 1];
    if ([...last].length < 2 || [...last].length > 40) continue;
    if (NOISE_LINES.has(last.toLowerCase())) continue;
    return last;
  }
  return null;
}

function isIngredientHeading(line) {
  const stripped = strippedHeading(line);
  if ([...stripped].length > 30) return false;
  return INGREDIENT_HEADINGS.some((h) => stripped.startsWith(h));
}

function isEndHeading(line) {
  const stripped = strippedHeading(line);
  if ([...stripped].length > 30) return false;
  return END_HEADINGS.some((h) => stripped.startsWith(h));
}

/**
 * レシピの文章から、料理名と材料欄を取り出す。
 *
 * Webページを丸ごと保存したPDFには、メニュー・広告・関連レシピ・コメントなど
 * 材料と関係のない文字が大量に含まれる。ここで材料欄だけに絞り込む。
 */
export function prepareRecipe(raw) {
  const lines = tidy(raw);
  const title = breadcrumbTitle(lines);

  const start = lines.findIndex(isIngredientHeading);
  if (start === -1) {
    // 「材料」の見出しが無いときでも、「作り方」以降は材料ではない。
    // 写真から読み取った文章には見出しが入らないことが多いので、ここで切る。
    const end = lines.findIndex(isEndHeading);
    return {
      lines: end === -1 ? lines : lines.slice(0, end),
      title,
      sectionLines: [],
      foundSection: false,
    };
  }

  const searchEnd = Math.min(lines.length, start + 80);
  let end = searchEnd;
  for (let i = start + 1; i < searchEnd; i++) {
    if (isEndHeading(lines[i])) {
      end = i;
      break;
    }
  }

  return {
    lines,
    title: title ?? guessTitle(lines, start),
    sectionLines: lines.slice(start + 1, end),
    foundSection: end > start + 1,
  };
}

/** 料理名になりえない行。誌面の飾り文字やページ番号が紛れ込むのを防ぐ。 */
const TITLE_NOISE = /^(サイズ|材料|作り方|調理|下ごしらえ|保存|冷凍|半解凍|解凍|完成|memo|point)/i;

function isTitleNoise(line) {
  const text = normalizeText(line);
  const length = [...text].length;
  if (length < 2 || length > 40) return true;
  if (/^[0-9A-Za-z\s.,'"()-]+$/.test(text)) return true; // ページ番号や英字の飾り
  if (/^[0-9]/.test(text)) return true;
  if (text.endsWith("。")) return true; // 「〜にぴったり。」のような煽り文
  if (TITLE_NOISE.test(text)) return true;
  if (isQuantity(text)) return true;
  if (text.includes("人分")) return true;
  if (text.includes("分") && length < 8) return true;
  return false;
}

/**
 * パンくずが無いとき、材料欄の手前から料理名らしい行を探す。
 *
 * 雑誌の見開きを撮った写真では、大きな見出しが「鮭と小松菜の」「中華蒸し」のように
 * 2行に割れて読み取られる。直前の行が「の」「と」で終わっていれば続きとみなしてつなぐ。
 */
function guessTitle(lines, start) {
  const candidates = [];
  for (let i = start - 1; i >= 0 && i >= start - 10; i--) {
    if (isTitleNoise(lines[i])) continue;
    candidates.push(lines[i].trim());
    if (candidates.length >= 3) break;
  }
  if (candidates.length === 0) return null;

  let title = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const previous = candidates[i];
    if (!/[のとやと・&]$/.test(previous)) break;
    if ([...previous].length + [...title].length > 40) break;
    title = previous + title;
  }
  return title;
}

// ---------------------------------------------------------------------------
// 材料の抜き出し
// ---------------------------------------------------------------------------

const MARKER_PATTERN = /^[●○◯◎▲△▼■□★☆・※＊*+\-–—:：「」『』\s]+|[\s:：・.]+$/g;

// 「A｜トマト缶」「A しょうがのせん切り」の A は、合わせ調味料をまとめる記号であって
// 材料名ではない。1文字のアルファベットに区切り記号が続く形だけを落とす。
const GROUP_MARKER = /^(?:[A-Za-zＡ-Ｚａ-ｚ][｜|:：\s]\s*|[A-EＡ-Ｅ](?=[ぁ-んァ-ヶ一-龠]))/;

function stripMarkers(text) {
  let result = text.replace(MARKER_PATTERN, "").trim();
  const withoutGroup = result.replace(GROUP_MARKER, "").trim();
  if ([...withoutGroup].length >= 2) result = withoutGroup;
  return result.replace(MARKER_PATTERN, "").trim();
}

/**
 * 「酒、酢・各大さじ1」「塩、こしょう」のように1行へまとめられた材料を分ける。
 * 分けたそれぞれに同じ分量を持たせる。レシピ本の「各」はその意味で使われる。
 */
function splitSharedNames(name) {
  const base = name.replace(/[・\s]*各$/, "").trim();
  if (!base.includes("、")) return [name];

  const parts = base.split("、").map(stripMarkers).filter(Boolean);
  if (parts.length < 2) return [name];
  if (parts.some((part) => [...part].length > 12)) return [name];
  return parts;
}

/**
 * その文字列が、まるごと「分量」として読めるかどうか。
 *
 * 数字で始まるだけでは分量とみなさない。「3種のチーズ」のような材料名を
 * 捨ててしまうため、後ろに付く単位が短いことまで確かめる。
 */
export function isQuantity(text) {
  const value = normalizeText(text);
  if (!value) return false;
  if (VAGUE_QUANTITIES.some((v) => value === v || value.startsWith(v))) return true;

  const amount = parseAmount(value);
  if (!amount) return false;
  return [...amount.unit].length <= 4;
}

/** 見出しや分量表記が材料として紛れ込むのを防ぐ。 */
function isIngredientName(name) {
  const length = [...name].length;
  if (!name || length > 30) return false;
  if (/[＜＞<>]/.test(name)) return false;
  if (name.includes("人分") || name.includes("人前")) return false;
  if (isQuantity(name)) return false;
  return !["材料", "調味料", "作り方", "つくり方", "手順", "メモ"].includes(name);
}

/**
 * 材料欄の行から、材料名と分量の組を作る。
 *
 * レシピサイトの書き方は主に2通りある。
 *   1) 「鶏もも肉  1枚」のように1行に名前と分量が並ぶ
 *   2) 「鶏もも肉」の次の行に「1枚」が来る
 * どちらでも読めるようにしている。
 */
export function parseIngredients(sectionLines) {
  const results = [];
  let pending = null;

  const flush = (quantity) => {
    if (!pending) return;
    results.push({ name: pending, quantity: quantity ?? "" });
    pending = null;
  };

  for (const rawLine of sectionLines) {
    const line = normalizeSeparators(rawLine);
    if (!line) continue;

    // 「＜香味だれ＞」のような小見出しは、材料ではないので区切りとして扱う。
    if (/^[＜<【].*[＞>】]/.test(line) || line.includes("人分")) {
      flush(null);
      continue;
    }

    // 行まるごとが分量なら、直前の名前に付ける。
    // これを先に見ないと、「大2」を「大」と「2」に割ってしまう。
    if (isQuantity(line)) {
      if (pending) flush(line);
      continue;
    }

    // 行の途中で名前と分量が分かれている場合。空白の区切りを先に見て、
    // 無ければ「玉ねぎ1個」のように続けて書かれている形を試す。
    const split = splitNameAndQuantity(line) ?? splitAttachedQuantity(line);
    if (split) {
      flush(null);
      const name = stripMarkers(split.name);
      if (isIngredientName(name)) results.push({ name, quantity: split.quantity });
      continue;
    }

    const name = stripMarkers(line);
    flush(null);
    if (isIngredientName(name)) pending = name;
  }

  flush(null);

  return results.flatMap((item) =>
    splitSharedNames(item.name).map((name) => ({
      name,
      quantity: mergeQuantities([item.quantity]),
      category: categorize(name),
    })),
  );
}

/** 「鶏もも肉  1枚（約300g）」のような1行を、名前と分量に割る。 */
function splitNameAndQuantity(line) {
  const match = line.match(/^(.*?)[\s　\t]+(\S+)$/);
  if (!match) return null;

  const [, name, quantity] = match;
  if (!name.trim() || !isQuantity(quantity)) return null;
  return { name: name.trim(), quantity: quantity.trim() };
}

/**
 * 分量が始まりそうな位置の目印。全角の数字と分数記号も含める。
 * 「醤油大2」を「醤油」と「大2」に割れるよう、数字が続く「大」「小」も候補にする。
 */
const QUANTITY_START = /[0-9０-９½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|大さじ|小さじ|カップ|[大小](?=[0-9０-９])/g;

/**
 * 「玉ねぎ1個」「牛こま切れ肉200g」のように、区切りなしで分量が続く書き方を割る。
 *
 * 写真の文字認識では空白が落ちやすく、この形になることが多い。
 * ただし「3種のチーズ」のような材料名まで割ってしまうと困るので、
 * 切り出した後ろ側が本当に分量として読めるときだけ採用する。
 */
function splitAttachedQuantity(line) {
  const text = line.trim();
  if (!text) return null;

  // 「塩少々」「醤油適量」のように、数値を持たない分量が末尾に付く形。
  for (const vague of VAGUE_QUANTITIES) {
    if (text.length > vague.length && text.endsWith(vague)) {
      return { name: text.slice(0, -vague.length).trim(), quantity: vague };
    }
  }

  // 区切れそうな位置を左から順に試し、後ろ側が分量として読める最初の場所を採る。
  QUANTITY_START.lastIndex = 0;
  for (const match of text.matchAll(QUANTITY_START)) {
    const index = match.index;
    if (index <= 0) continue;

    const name = text.slice(0, index).trim();
    const quantity = text.slice(index).trim();
    if (!name || [...name].length > 20 || !quantity) continue;

    // 後ろ側が「数値＋単位」として読めない、または単位が長すぎる（＝材料名の一部）なら見送る。
    const amount = parseAmount(quantity);
    if (!amount || [...amount.unit].length > 4) continue;

    return { name, quantity };
  }
  return null;
}

/** 「玉ねぎ……1個」のような点線の区切りを、空白に直す。 */
function normalizeSeparators(line) {
  return line.replace(/[…‥]+|[.．・]{2,}|[:：]\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

// ---------------------------------------------------------------------------
// まとめ
// ---------------------------------------------------------------------------

/**
 * レシピの文章から、そのまま買い物リストに足せる形を作る。
 * 見つからなければ ingredients が空の配列で返る。
 */
export function extractRecipe(raw, fallbackName = "レシピ") {
  const prepared = prepareRecipe(raw);
  const source = prepared.foundSection ? prepared.sectionLines : prepared.lines;
  const ingredients = parseIngredients(source);

  return {
    dishName: prepared.title ?? fallbackName,
    foundSection: prepared.foundSection,
    ingredients,
  };
}

/** 材料をまとめて、売り場順に並べる。同じ材料は分量を足し、レシピ名をつなぐ。 */
export function mergeIngredients(ingredients) {
  const order = [];
  const groups = new Map();

  for (const ingredient of ingredients) {
    const key = normalizeName(ingredient.name);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(ingredient);
  }

  const merged = order.map((key) => {
    const group = groups.get(key);
    const recipes = [...new Set(group.flatMap((i) => i.recipes ?? []))];
    return {
      name: group[0].name,
      quantity: mergeQuantities(group.map((i) => i.quantity)),
      category: group[0].category,
      recipes,
    };
  });

  return merged.sort((a, b) => {
    const diff = categoryIndex(a.category) - categoryIndex(b.category);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "ja");
  });
}

/**
 * 「½缶」が「12缶」と読まれるように、分数記号は写真から読み取ると
 * 数字2つになることがある。その形に当てはまる分量を返す。
 *
 * 本当に12個ということもあるので、勝手には直さない。画面で知らせて選ばせる。
 * gやmlのような計量の単位は、分数で書かれることがないので対象にしない。
 */
const FRACTION_LOOKALIKE = new Set([12, 13, 14, 15, 16, 18, 23, 25, 34, 35, 38, 45, 56, 58, 78]);
const COUNTABLE_UNITS = [
  "個", "本", "枚", "束", "玉", "房", "缶", "袋", "パック", "かけ", "切れ",
  "尾", "丁", "株", "片", "杯", "膳", "節", "袋",
];

export function suspectFraction(quantity) {
  const text = normalizeText(quantity ?? "");
  const match = text.match(/^(大さじ|小さじ|カップ)?([1-9][0-9])(.*)$/);
  if (!match) return null;

  const prefix = match[1] ?? "";
  const digits = match[2];
  const rest = match[3];
  if (!FRACTION_LOOKALIKE.has(Number(digits))) return null;
  if (!prefix && !COUNTABLE_UNITS.some((unit) => rest.startsWith(unit))) return null;

  return `${prefix}${digits[0]}/${digits[1]}${rest}`;
}

/** 表記ゆれを吸収してから同じ材料かどうか判定する。 */
export function normalizeName(name) {
  return String(name).trim().split(" ").join("").split("　").join("").toLowerCase();
}
