const { containsPhrase, normalizeForMatching } = require("./chatbotLexicon");

const MAX_CONCEPTS = 6;

const CONCEPTS = Object.freeze([
  ["programming", ["programming", "coding", "software development", "lập trình", "lap trinh", "node.js", "javascript", "python", "c++", "code"]],
  ["database", ["database", "databases", "mongodb", "sql", "cơ sở dữ liệu", "co so du lieu"]],
  ["software engineering", ["software engineering", "kỹ nghệ phần mềm", "ky nghe phan mem"]],
  ["artificial intelligence", ["artificial intelligence", "machine learning", "ai", "trí tuệ nhân tạo", "tri tue nhan tao"]],
  ["data", ["data", "dữ liệu", "du lieu", "analytics", "phân tích dữ liệu", "phan tich du lieu"]],
  ["business", ["business", "management", "kinh doanh", "quản trị", "quan tri"]],
  ["science", ["science", "khoa học", "khoa hoc", "scientific"]],
  ["history", ["history", "lịch sử", "lich su"]],
  ["fiction", ["fiction", "novel", "science fiction", "tiểu thuyết", "tieu thuyet", "viễn tưởng", "vien tuong"]],
  ["self-development", ["self-development", "self development", "personal development", "phát triển bản thân", "phat trien ban than"]],
  ["beginner", ["beginner", "for beginners", "new to", "người mới bắt đầu", "nguoi moi bat dau"]],
  ["practical", ["practical", "hands-on", "thực hành", "thuc hanh"]],
]);

function inferConcepts(text) {
  const forms = Object.values(normalizeForMatching(text));
  return CONCEPTS
    .filter(([, aliases]) => aliases.some((alias) => {
      const aliasForms = Object.values(normalizeForMatching(alias));
      return aliasForms.some((form) => forms.some((candidate) => containsPhrase(candidate, form)));
    }))
    .map(([concept]) => concept)
    .slice(0, MAX_CONCEPTS);
}

function normalizeRetrievalText(original) {
  const text = String(original || "").trim();
  const concepts = inferConcepts(text);
  if (!concepts.length) return text;
  return `${text}${text ? ". " : ""}Concepts: ${concepts.join(", ")}`;
}

module.exports = {
  CONCEPTS,
  MAX_CONCEPTS,
  inferConcepts,
  normalizeRetrievalText,
};
