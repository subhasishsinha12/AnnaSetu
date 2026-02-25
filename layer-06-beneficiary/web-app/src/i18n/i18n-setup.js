/**
 * AnnaSetu — i18next setup (Hindi / Gujarati / English)
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations } from './translations';

i18n
  .use(initReactI18next)
  .init({
    resources: translations,
    lng: localStorage.getItem('annasetu_lang') || 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('annasetu_lang', lng);
});

export default i18n;
