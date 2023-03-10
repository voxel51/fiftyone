type LangType = "en" | "zh-CN" | "zh";
declare const window: Window & { _ivai_lang: LangType };
window._ivai_lang = "en";
function getQuery() {
  var query = location.search;
  var vars = query.split("&");
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split("=");
    console.log(pair);
    if (pair[0] == "lang") {
      if (pair[1] == "zh" || pair[1] == "en") {
        return pair[1];
      } else {
        return false;
      }
    }
  }
  return false;
}
export function getLangType() {
  const queryLang: LangType | Boolean = getQuery();
  const cacheLang = localStorage.getItem("_ivai_lang");
  const navLang = navigator.language || navigator.userLanguage;
  if (queryLang) {
    setLangType(queryLang as LangType);
    return queryLang;
  } else if (cacheLang) {
    setLangType(cacheLang as LangType);
    return cacheLang;
  } else if (navLang == "zh-CN" || navLang == "en") {
    setLangType(navLang as LangType);
    return navLang;
  } else {
    return window._ivai_lang;
  }
}
export function setLangType(lang: LangType) {
  window._ivai_lang = lang;
  localStorage.setItem("_ivai_lang", lang);
}
