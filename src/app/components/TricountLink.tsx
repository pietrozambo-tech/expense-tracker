import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { t } from '../i18n';
import { useBackClose } from '../lib/useBackClose';

/** Where the CSV gets made. Client-side, and not ours. */
const TOOL = 'https://tricount-exporter.pages.dev';

/**
 * The word "Tricount", wherever it appears on the import screens, with the
 * thing nobody knows said before the tap lands.
 *
 * Splitwise has an export button; Tricount does not. So the name has always
 * linked to a small external tool that makes the CSV from a share link - but
 * a tap took you straight to an unfamiliar site with a box on it, with no
 * idea what the box was for or why you were there. People do not know this
 * tool exists, and a link that explains nothing cannot tell them.
 *
 * So: one short screen first, then the tool. It is the rare dialog that
 * earns its tap - not a confirmation of something obvious, but the only
 * place the missing step gets explained.
 *
 * The primary action is a real <a target="_blank">, not a scripted
 * window.open: the browser handles the hop itself, which matters from an
 * installed PWA where this has to leave for the system browser.
 */
export function TricountLink() {
  const [asking, setAsking] = useState(false);
  useBackClose(asking, () => setAsking(false));

  return (
    <>
      <button
        data-tricount-link
        onClick={() => setAsking(true)}
        style={{
          color: 'var(--accent-ink)', fontWeight: 600, textDecoration: 'underline',
          background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer',
        }}
      >
        Tricount
      </button>

      {asking && (
        <div
          data-overlay
          data-tricount-note
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6 max-w-[430px] mx-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setAsking(false); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="pt-6 px-6 flex justify-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--wash-accent2)' }}
              >
                <ExternalLink className="w-8 h-8" style={{ color: 'var(--accent-ink)' }} />
              </div>
            </div>

            <div className="px-6 py-4 text-center">
              <h3 className="text-neutral-900 font-semibold text-lg mb-2">{t('ai.tricountTitle')}</h3>
              <p className="text-neutral-600 text-sm">{t('ai.tricountBody')}</p>
              {/* Said plainly, because the next screen asks for the link to
                  their trip and it is not ours to ask for. */}
              <p className="text-neutral-400 text-xs mt-2.5">{t('ai.tricountNote')}</p>
            </div>

            <div className="p-4 flex gap-3">
              <button
                data-tricount-cancel
                onClick={() => setAsking(false)}
                className="flex-1 py-3 rounded-xl font-medium text-base transition-colors active:scale-[0.98]"
                style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--ink)' }}
              >
                {t('common.cancel')}
              </button>
              <a
                data-tricount-go
                href={TOOL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAsking(false)}
                className="flex-1 py-3 rounded-xl font-medium text-base text-white text-center transition-colors active:scale-[0.98]"
                style={{ backgroundColor: '#4F74F3' }}
              >
                {t('ai.tricountGo')}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
