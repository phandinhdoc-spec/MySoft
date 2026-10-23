import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WelcomeActions } from '../src/WelcomeActions';
import { SUGGESTIONS } from '../src/i18n';

describe('welcome actions match the Office host', () => {
  for (const lang of ['vi', 'en'] as const) {
    for (const host of ['word', 'excel', 'powerpoint'] as const) {
      it(`${lang}: ${host} shows its own tasks`, () => {
        const html = renderToStaticMarkup(createElement(WelcomeActions, { host, lang, onChoose: () => {} }));
        for (const prompt of SUGGESTIONS[lang][host]) expect(html).toContain(prompt.replaceAll("'", '&#x27;'));
        if (host !== 'word') expect(html).not.toContain('Rà soát NĐ 30');
      });
    }
  }
});
