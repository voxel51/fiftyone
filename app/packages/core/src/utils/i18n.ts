import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../lang/en";
import zh from "../lang/zh";
import { getLangType } from "./lang";
import intervalPlural from "i18next-intervalplural-postprocessor";
console.log(en, zh);
const longType = getLangType();
console.log(longType);
i18n
  .use(intervalPlural)
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init({
    debug: false,
    fallbackLng: "en",
    lng: longType,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    resources: {
      en: {
        translation: en,
        components: en.components,
      },
      zh: {
        translation: zh,
        components: zh.components,
      },
      "zh-CN": {
        translation: zh,
        components: zh.components,
      },
    },
  });

export default i18n;
