// core.js の動作確認。node web/test.mjs で実行する。

import {
  mergeQuantities,
  parseIngredients,
  normalizeName,
  extractRecipe,
  mergeIngredients,
  categorize,
} from "./core.js";

let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  NG  "} ${label}\n        期待: ${expected}\n        実際: ${actual}`);
}

// ---------------------------------------------------------------------------
console.log("\n■ 分量の合算");

check("½個 + 1個 + 1/2個", mergeQuantities(["½個", "1個", "1/2個"]), "2個");
check("1本(30g) + 1本(80g)", mergeQuantities(["１本(30g)", "1本(80g)"]), "2本(110g)");
check("1かけ + 1かけ分", mergeQuantities(["1かけ", "1かけ分"]), "2かけ");
check("大1 + 大2", mergeQuantities(["大1", "大2"]), "大さじ3");
check("少々 + 小さじ1", mergeQuantities(["少々", "小さじ1"]), "小さじ1");
check("1/2 + 1個", mergeQuantities(["1/2", "1個"]), "1 1/2個");
check("2〜3本 + 1本", mergeQuantities(["2〜3本", "1本"]), "4本");
check("1コ + 2個", mergeQuantities(["1コ", "2個"]), "3個");
check("100cc + 50ml", mergeQuantities(["100cc", "50ml"]), "150ml");
check("2個 + 4g（再合算）", mergeQuantities(["2個 + 4g", "1個"]), "3個 + 4g");
check("単体: 大1", mergeQuantities(["大1"]), "大さじ1");
check("単体: 小1/4", mergeQuantities(["小1/4"]), "小さじ1/4");
check("単体: 1枚（約300g）", mergeQuantities(["1枚（約300g）"]), "1枚(300g)");
check("単体: 少々", mergeQuantities(["少々"]), "少々");
check("単体: 大2個（略記ではない）", mergeQuantities(["大2個"]), "大2個");

// ---------------------------------------------------------------------------
console.log("\n■ カテゴリの判定");

check("鶏もも肉", categorize("鶏もも肉"), "肉・魚");
check("鶏がらスープの素", categorize("鶏がらスープの素"), "調味料");
check("ごま油", categorize("ごま油"), "調味料");
check("長ねぎ（白い部分）", categorize("長ねぎ（白い部分）"), "野菜");
check("しょうが", categorize("しょうが"), "野菜");
check("醤油", categorize("醤油"), "調味料");
check("片栗粉", categorize("片栗粉"), "調味料");
check("卵", categorize("卵"), "乳製品・卵");
check("木綿豆腐", categorize("木綿豆腐"), "その他");

// ---------------------------------------------------------------------------
console.log("\n■ 実際のレシピページ（つくおき・油淋鶏）");

const yurinchi = `
MENU

SEARCH
HOME > レシピ > 肉のおかず > 揚げずに簡単！基本の油淋鶏
揚げずに簡単！基本の油淋鶏 揚げずに簡単！基本の油淋鶏 揚げずに簡単！基本の油淋鶏
RECIPE RECIPE RECIPE RECIPE
SHARE SHARE SHARE SHARE 2026/01/30更新
 20分  日持ち：冷蔵5日
油淋鶏（ユーリンチー）は、揚げた鶏肉に甘酸っぱいねぎ香味だ
れをかける、日本でおなじみの中華風料理です。
材料（保存容器大小各1個分）
食べきりの場合 2～3人分

COPY
鶏もも肉
1枚（約300g）
●塩
小1/4
●ブラックペッパー
少々
●酒
大1
片栗粉
大3～4
＜香味だれ＞ ＜香味だれ＞ ＜香味だれ＞（メモ1）
長ねぎ（白い部分）
1/2本
しょうが
1かけ（約10g）
◯醤油
大2
◯酢
大2
◯砂糖
大1
◯ごま油
大1/2
作り方
＜鶏肉の下ごしらえ＞（メモ2）
１
鶏肉の黄色い脂肪や軟骨を取り除き、はみ出た皮
と白い筋は切り落とします。●をもみ込みます。
 鶏肉を使った人気レシピ 鶏肉を使った人気レシピ
鶏肉と玉ねぎの醤油マヨ炒め
`;

const recipe = extractRecipe(yurinchi);
check("料理名", recipe.dishName, "揚げずに簡単！基本の油淋鶏");
check("材料欄を見つけた", String(recipe.foundSection), "true");
check("材料の数", String(recipe.ingredients.length), "11");

console.log("\n  抽出結果:");
for (const item of recipe.ingredients) {
  console.log(`    ${item.category.padEnd(6, "　")} ${item.name}  ${item.quantity}`);
}

// 関連レシピを拾っていないこと
const names = recipe.ingredients.map((i) => i.name);
check(
  "関連レシピを材料にしていない",
  String(names.includes("鶏肉と玉ねぎの醤油マヨ炒め")),
  "false"
);

// ---------------------------------------------------------------------------
console.log("\n■ 1行に名前と分量が並ぶ書き方");

const oneLine = `
肉じゃが
材料 4人分
牛こま切れ肉　200g
じゃがいも　3個
玉ねぎ　1個
にんじん　1/2本
醤油　大さじ3
作り方
1. 材料を切ります
`;

const recipe2 = extractRecipe(oneLine);
check("料理名", recipe2.dishName, "肉じゃが");
check("材料の数", String(recipe2.ingredients.length), "5");
console.log("\n  抽出結果:");
for (const item of recipe2.ingredients) {
  console.log(`    ${item.category.padEnd(6, "　")} ${item.name}  ${item.quantity}`);
}

// ---------------------------------------------------------------------------
console.log("\n■ 2つのレシピをまとめる");

const combined = mergeIngredients([
  ...recipe.ingredients.map((i) => ({ ...i, recipes: [recipe.dishName] })),
  ...recipe2.ingredients.map((i) => ({ ...i, recipes: [recipe2.dishName] })),
]);

console.log("\n  買い物リスト:");
for (const item of combined) {
  const quantity = item.quantity ? `（${item.quantity}）` : "";
  console.log(`    [${item.category}] ${item.name}${quantity}  ← ${item.recipes.join("・")}`);
}

const soy = combined.find((i) => i.name.includes("醤油"));
check("醤油が合算されている", soy?.quantity ?? "-", "大さじ5");
check("醤油が2つのレシピに紐づく", String(soy?.recipes.length ?? 0), "2");

// ---------------------------------------------------------------------------
// iPhoneのショートカットで雑誌の見開きを読み取った実物。
// 見出しが2行に割れる、合わせ調味料の「A」が付く、「各」でまとめ書きされる、
// という誌面特有の癖がすべて入っている。
console.log("\n■ 雑誌の写真から読み取った文章");

const scanned = `レンチンの
簡単蒸しで
ヘルシー魚料理が完成
鮭と小松菜の
中華蒸し
サイズ
材料 (2人分)
鮭...・2切れ
小松菜・・・1束 (200g)
にんじん・・・⅕本 (30g)
A しょうがのせん切り
...1かけ分
酒、酢・各大さじ1
しょうゆ・・・・大さじ1½
ごま油・・・大さじ1
塩、こしょう・・・各少々
作り方
小松菜は5cm長さに切る。
134`;

const scan = extractRecipe(scanned);
check("2行に割れた見出しをつなぐ", scan.dishName, "鮭と小松菜の中華蒸し");
check("材料の数", String(scan.ingredients.length), "10");

const find = (name) => scan.ingredients.find((i) => i.name === name);
check("合わせ調味料の記号Aを外す", find("しょうがのせん切り")?.quantity ?? "-", "1かけ");
check("「酒、酢・各大さじ1」を酒に分ける", find("酒")?.quantity ?? "-", "大さじ1");
check("同じく酢に分ける", find("酢")?.quantity ?? "-", "大さじ1");
check("「塩、こしょう・各少々」を塩に分ける", find("塩")?.quantity ?? "-", "少々");
check("同じくこしょうに分ける", find("こしょう")?.quantity ?? "-", "少々");
check("⅕を分数のまま出す", find("にんじん")?.quantity ?? "-", "1/5本(30g)");
check("1½を足した形にする", find("しょうゆ")?.quantity ?? "-", "大さじ1 1/2");
check("末尾の中黒を外す", find("鮭")?.quantity ?? "-", "2切れ");

console.log("\n  抽出結果:");
for (const item of scan.ingredients) {
  console.log(`    ${item.category.padEnd(6, "　")} ${item.name}  ${item.quantity}`);
}

// ---------------------------------------------------------------------------
// 冷凍作り置きのムック本を、ショートカットで読み取った実物。
// 三点リーダーが「…」「⋯」「•」と混在し、2つの材料が1行につながり、
// 材料欄の続きが「作り方」の後ろに回っている。誌面の難所が全部入っている。
console.log("\n■ ムック本の写真から読み取った文章");

const magazine = `ゴロッと入ったしいたけと、オイスターソースのコクが絶妙にマッチ
鮭と
しいたけのうま煮
サイズ
材料（2人分）
鮭...2切れしいたけ・・・4個
ねぎ…1本
しょうがのせん切り...1かけ分
酒、オイスターソース
…各大さじ1
しょうゆ・小さじ2
砂糖⋯大 ½
作り方
鮭は一口大のそぎ切りにする。しいたけは半分に切る。
130`;

const mag = extractRecipe(magazine);
check("見出しをつなぐ", mag.dishName, "鮭としいたけのうま煮");
check("材料の数", String(mag.ingredients.length), "8");

const at = (name) => mag.ingredients.find((i) => i.name === name)?.quantity ?? "-";
check("1行に混ざった2材料を割る（鮭）", at("鮭"), "2切れ");
check("1行に混ざった2材料を割る（しいたけ）", at("しいたけ"), "4個");
check("… を区切りとして読む", at("ねぎ"), "1本");
check("... を区切りとして読む", at("しょうがのせん切り"), "1かけ");
check("中黒ひとつを区切りとして読む", at("しょうゆ"), "小さじ2");
check("⋯ と「大 ½」を読む", at("砂糖"), "大さじ1/2");
check("次行の「各大さじ1」を2品に配る（酒）", at("酒"), "大さじ1");
check("同じくオイスターソース", at("オイスターソース"), "大さじ1");

// 材料欄の続きが「作り方」の後ろに回っている誌面。
const stray = `ポトフ
材料（2人分）
鷄手羽元…4本
にんじん•・1本（80g
玉ねぎ…½個
作り方
手羽元は骨に沿って切り目を入れ、塩、こしょうをもみ込む。
玉ねぎは6～8等分のくし形切りにする。
キャベツ・・100g
にんにく・・1かけ
A
酒…大さじ1
鶏ガラスープのもと…・小さじ1
半解凍で！
調理
半解凍でなべに入れ、水212カップを加えてふたをし、中火にかける。
ふたをとって4〜5分
54`;

const pot = extractRecipe(stray);
const potNames = pot.ingredients.map((i) => i.name);
check("作り方の後ろの材料を拾う", potNames.join("・"),
  "鷄手羽元・にんじん・玉ねぎ・キャベツ・にんにく・酒・鶏ガラスープのもと");
check("閉じ括弧が欠けても読む", pot.ingredients.find((i) => i.name === "にんじん")?.quantity ?? "-", "1本(80g)");
check("手順の文章は材料にしない", String(potNames.includes("ふたをとって")), "false");
check("記号だけの行は材料にしない", String(potNames.includes("A")), "false");

// 読み取りで壊れた数字。
check("¼/4 は 1/4", mergeQuantities(["小さじ¼/4"]), "小さじ1/4");
check("末尾の斜線を落とす", mergeQuantities(["大さじ1/"]), "大さじ1");
check("2切 と 2切れ を足す", mergeQuantities(["2切", "2切れ"]), "4切れ");

// ---------------------------------------------------------------------------
// レシピサイトをまるごと共有したときの文章。写真を通さないので読み違いは無いが、
// メニュー・パンくず・広告・関連レシピ・ページ末の飾りが大量に混ざる。
console.log("\n■ レシピサイトの文章まるごと");

const website = `MENU
SEARCH
HOME > レシピ > 肉のおかず > 鶏むね肉の梅しそ焼き
鶏むね肉の梅しそ焼き 鶏むね肉の梅しそ焼き
RECIPE RECIPE
SHARE SHARE 2020/02/28更新
 15分  日持ち：冷蔵5日
さっぱりさっくりおいしい、鶏むね肉の梅しそ焼きのレシピです。
材料（保存容器大１個分）
食べきりの場合 ３～４人分
鶏むね肉
１枚（約３５０ｇ）
◯砂糖
大１／２
◯塩
小１／２
片栗粉
大１
梅干し（メモ１）
大３粒
大葉
４～５枚
◎みりん
大１．５
◎醤油
大１／２
作り方
１
鶏肉は室温に戻します。余分な脂を取り除きます。
２
梅干しは種を取り、たたいてペースト状にします。
 20分  冷蔵5日
容量：800ml
子どもOK お弁当 肉のおかず 日持ち5日`;

const site = extractRecipe(website);
check("パンくずから料理名を取る", site.dishName, "鶏むね肉の梅しそ焼き");
check("材料の数", String(site.ingredients.length), "8");

const on = (name) => site.ingredients.find((i) => i.name === name)?.quantity ?? "-";
check("全角の数字と括弧を読む", on("鶏むね肉"), "1枚(350g)");
check("全角の斜線 １／２ を読む", on("砂糖"), "大さじ1/2");
check("全角の小数点 １．５ を読む", on("みりん"), "大さじ1 1/2");
check("（メモ1）は材料名から外す", on("梅干し"), "大3粒");
check("範囲は多いほうを採る", on("大葉"), "5枚");
check("ページ末の飾りを拾わない",
  String(site.ingredients.some((i) => ["容量", "冷蔵", "日持ち"].some((w) => i.name.includes(w)))), "false");
check("◯◎の記号を外す", on("塩"), "小さじ1/2");

// ---------------------------------------------------------------------------
// ■ 作り置きサイトのPDFを7本まとめて取り込んだときに出た不具合
// ---------------------------------------------------------------------------

const prose = parseIngredients([
  "す。鶏肉を皮目を下にして入れ、 20秒ほ",
  "ふたをとって 4〜5分",
  "鶏もも肉 2枚（550g）",
]);
check("手順の文章を材料にしない", String(prose.length), "1");
check("残るのは材料だけ", prose[0]?.name ?? "-", "鶏もも肉");

check("枚とgが混ざったら括弧の中に揃える", mergeQuantities(["600g", "2枚(550g)"]), "1150g");
check("揃える単位がなければ並記のまま", mergeQuantities(["2個", "4g"]), "2個 + 4g");
check("同じ単位の括弧は今までどおり", mergeQuantities(["1本(30g)", "1本(80g)"]), "2本(110g)");

// ---------------------------------------------------------------------------
// ■ 書き方が違うだけの材料を1行にまとめる
// ---------------------------------------------------------------------------

const spellings = mergeIngredients([
  { name: "たまねぎ", quantity: "1/2個", category: "野菜", recipes: ["みそマヨ炒め"] },
  { name: "玉ねぎ", quantity: "1/2個", category: "野菜", recipes: ["醤油マヨ炒め"] },
  { name: "タマネギ", quantity: "1個", category: "野菜", recipes: ["肉じゃが"] },
  { name: "しょうゆ", quantity: "大さじ1", category: "調味料", recipes: ["肉じゃが"] },
  { name: "醤油", quantity: "大さじ2", category: "調味料", recipes: ["醤油マヨ炒め"] },
  { name: "小ねぎ", quantity: "少々", category: "野菜", recipes: ["みそマヨ炒め"] },
  { name: "長ねぎ", quantity: "1本", category: "野菜", recipes: ["甘辛炒め"] },
]);

const spelled = (name) => spellings.find((i) => i.name === name);
check("玉ねぎ・たまねぎ・タマネギを1つにする", String(spellings.length), "4");
check("まとめた分量を足す", spelled("玉ねぎ")?.quantity ?? "-", "2個");
check("画面に出す名前をそろえる",
  String(spellings.some((i) => ["たまねぎ", "タマネギ"].includes(i.name))), "false");
check("3つのレシピが並ぶ", String(spelled("玉ねぎ")?.recipes.length ?? 0), "3");
check("しょうゆと醤油も1つにする", spelled("醤油")?.quantity ?? "-", "大さじ3");
check("小ねぎと長ねぎは別のまま",
  String(normalizeName("小ねぎ") === normalizeName("長ねぎ")), "false");

check("鳥もも肉と鶏もも肉は同じ", normalizeName("鳥もも肉"), normalizeName("鶏もも肉"));
check("にんじんと人参は同じ", normalizeName("人参"), normalizeName("にんじん"));
check("キャベツはカタカナのまま出す",
  mergeIngredients([{ name: "キャベツ", quantity: "1/4個", category: "野菜", recipes: [] }])[0].name,
  "キャベツ");

// ---------------------------------------------------------------------------
console.log(failures === 0 ? "\n✅ すべて通りました\n" : `\n❌ ${failures}件 失敗\n`);
process.exit(failures === 0 ? 0 : 1);
