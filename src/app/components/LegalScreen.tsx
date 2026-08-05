import { ChevronLeft } from 'lucide-react';
import type { LegalDoc } from '../lib/legalContent';

interface LegalScreenProps {
  doc: LegalDoc;
  onBack: () => void;
}

// Renders a legal document as a Settings sub-screen, in the same shell as
// Categories, Sources and the rest.
export function LegalScreen({ doc, onBack }: LegalScreenProps) {
  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#F6F5F2' }}>
      <div style={{ backgroundColor: '#F6F5F2' }}>
        <div className="px-6 pb-4 pt-0">
          <div className="flex items-center justify-center relative">
            <button
              onClick={onBack}
              className="absolute left-0 -ml-2 px-2 py-1 rounded-lg active:bg-neutral-200 transition-colors"
              aria-label="Back"
            >
              <ChevronLeft size={24} style={{ color: '#3B82F6' }} />
            </button>
            <h1 style={{ color: '#1C1C1E', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>
              {doc.title}
            </h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-6">
          <p style={{ color: '#8E8E93', fontSize: 12, marginBottom: 14 }}>Last updated {doc.updated}</p>

          <div className="bg-white rounded-2xl shadow-sm px-5 py-5">
            <p style={{ color: '#3A3A3C', fontSize: 15, lineHeight: 1.55 }}>{doc.intro}</p>

            {doc.sections.map((section) => (
              <div key={section.heading} className="mt-6">
                <h2 style={{ color: '#1C1C1E', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                  {section.heading}
                </h2>
                {section.body.map((paragraph, i) => (
                  <p
                    key={i}
                    style={{
                      color: '#6B6B75',
                      fontSize: 14,
                      lineHeight: 1.6,
                      marginTop: i === 0 ? 0 : 10,
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <p style={{ color: '#B0B0B5', fontSize: 12, textAlign: 'center', margin: '16px 0 0' }}>
            © {new Date().getFullYear()} TracklyLab
          </p>
        </div>
      </div>
    </div>
  );
}
