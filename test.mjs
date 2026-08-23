// core.js の動作確認。node web/test.mjs で実行する。

import {
  mergeQuantities,
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
console.log(failures === 0 ? "\n✅ すべて通りました\n" : `\n❌ ${failures}件 失敗\n`);
process.exit(failures === 0 ? 0 : 1);
